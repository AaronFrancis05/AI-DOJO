import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import {
  calendarTasks,
  conversations,
  corrections,
  learnerWeakPoints,
  scenarios,
  sessions,
  srsCards,
  studyPackItems,
  studyPacks,
  users,
} from '@/src/schema';
import { and, asc, desc, eq, gt, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { inngest, type SessionCompletedEvent } from '@/lib/inngest/client';
import { getAIProvider } from '@/lib/ai-providers';
import { hasBatchQuota, usageRecorder } from '@/lib/ai-usage';
import { createNotification } from '@/lib/notifications';
import { getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { loadLanguageCatalog } from '@/lib/language-registry';
import { getLearnerProficiency, resolveDifficulty } from '@/lib/roleplay/proficiency';
import {
  CLASSIFY_MAX_TOKENS,
  PACK_DUE_AFTER_DAYS,
  PACK_FOCUS_COUNT,
  PACK_MAX_TOKENS,
} from '@/lib/study-packs/config';
import {
  buildClassifyPrompt,
  parseClassification,
  planWeakPointUpdates,
  selectFocusWeakPoints,
  weakPointKey,
  type ExistingWeakPoint,
  type SessionCorrection,
  type WeakPointHit,
} from '@/lib/study-packs/weak-points';
import { buildStudyPackPrompt, parseStudyPack, type StudyPackDraft } from '@/lib/study-packs/pack';
import { cardTypeForItem, grammarCard, sentenceCard } from '@/lib/study-packs/cards';
import { scenarioTitleForLearner } from '@/lib/study-packs/server';
import { parseInterests } from '@/lib/study-packs/profile';

type StepTools = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

/** Most corrections one pack reads; a long session's tail adds little. */
const MAX_CORRECTIONS = 30;

/** Scenarios the learner completed this recently are not recommended again. */
const RECENT_SCENARIO_DAYS = 14;

/** How many next-scenario candidates the model chooses from. */
const CANDIDATE_LIMIT = 12;

async function loadWeakPoints(userId: string, targetLanguage: string): Promise<ExistingWeakPoint[]> {
  return db
    .select({
      id: learnerWeakPoints.id,
      category: learnerWeakPoints.category,
      pattern: learnerWeakPoints.pattern,
      count: learnerWeakPoints.count,
      cleanSessionCount: learnerWeakPoints.cleanSessionCount,
      lastSeenAt: learnerWeakPoints.lastSeenAt,
      resolvedAt: learnerWeakPoints.resolvedAt,
    })
    .from(learnerWeakPoints)
    .where(and(eq(learnerWeakPoints.userId, userId), eq(learnerWeakPoints.targetLanguage, targetLanguage)));
}

/**
 * The learner's homework after a completed session (PLAN.md 3.2).
 *
 * classify → generate → save → notify, each a step so a retry resumes after
 * the last one that succeeded instead of paying for the AI calls again. Both
 * calls run on the cheap `batch` model and are written to the `ai_usage`
 * ledger. The save is one transaction keyed on the session's unique
 * `study_packs` row, so a retried save finds the pack and writes nothing.
 *
 * Only reached when STUDY_PACKS_ENABLED is on: the event is not sent
 * otherwise (lib/study-packs/server.ts).
 */
export const generateStudyPack = inngest.createFunction(
  {
    id: 'generate-study-pack',
    triggers: { event: 'session/completed' },
    retries: 3 as const,
    // One at a time per learner: two sessions finishing together would
    // otherwise read and update the same weak-point rows concurrently.
    concurrency: { limit: 1, key: 'event.data.userId' },
  },
  async ({ event, step }: { event: { data: SessionCompletedEvent['data'] }; step: StepTools }) => {
    const { sessionId, userId } = event.data;

    const context = await step.run('load-session', async () => {
      const [row] = await db
        .select({
          userId: sessions.userId,
          status: sessions.status,
          targetLanguage: sessions.targetLanguage,
          nativeLanguage: sessions.nativeLanguage,
          scenarioId: scenarios.id,
          scenarioTitle: scenarios.title,
          scenarioDifficulty: scenarios.difficulty,
          tier: users.tier,
          occupation: users.occupation,
          interests: users.interests,
        })
        .from(sessions)
        .innerJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.id, sessionId))
        .limit(1);
      // The event names the learner; a session that is not theirs, or not
      // finished, is not something to build homework from.
      if (!row || row.userId !== userId || row.status !== 'completed') return null;

      const sessionCorrections: SessionCorrection[] = await db
        .select({
          id: corrections.id,
          correctionType: corrections.correctionType,
          originalText: corrections.originalText,
          correctedText: corrections.correctedText,
          explanation: corrections.explanation,
        })
        .from(corrections)
        .innerJoin(conversations, eq(corrections.conversationId, conversations.id))
        .where(eq(conversations.sessionId, sessionId))
        .orderBy(asc(corrections.id))
        .limit(MAX_CORRECTIONS);

      const proficiency = await getLearnerProficiency(userId, row.targetLanguage);
      return {
        targetLanguage: row.targetLanguage,
        nativeLanguage: row.nativeLanguage,
        scenarioId: row.scenarioId,
        scenarioTitle: row.scenarioTitle,
        learnerScenarioTitle: await scenarioTitleForLearner(
          { id: row.scenarioId, title: row.scenarioTitle },
          row.targetLanguage,
          row.nativeLanguage,
        ),
        difficulty: resolveDifficulty(row.scenarioDifficulty, proficiency),
        occupation: row.occupation,
        interests: parseInterests(row.interests),
        hasQuota: await hasBatchQuota(userId, row.tier),
        corrections: sessionCorrections,
      };
    });
    if (!context) return { skipped: 'session is not a completed session of this learner' };
    if (!context.hasQuota) {
      console.warn('[study-pack] skipped: daily AI quota reached', { userId, sessionId });
      return { skipped: 'quota' };
    }

    const hits: WeakPointHit[] = await step.run('classify-corrections', async () => {
      if (context.corrections.length === 0) return [];
      await loadLanguageCatalog();
      const existing = await loadWeakPoints(userId, context.targetLanguage);
      const usage = usageRecorder(userId, 'study-pack');
      const provider = await getAIProvider();
      const raw = await provider.generateJSON(
        buildClassifyPrompt({
          targetLanguageName: getTargetLangConfig(context.targetLanguage).name,
          corrections: context.corrections,
          existingPatterns: existing.map((p) => ({ category: p.category, pattern: p.pattern })),
        }),
        [],
        { modelTier: 'batch', maxTokens: CLASSIFY_MAX_TOKENS, onUsage: usage.onUsage },
      );
      await usage.flush();
      return parseClassification(raw, context.corrections);
    });

    const generated = await step.run('generate-pack', async (): Promise<{ draft: StudyPackDraft } | { draft: null }> => {
      await loadLanguageCatalog();
      const existing = await loadWeakPoints(userId, context.targetLanguage);
      const plan = planWeakPointUpdates(existing, hits);

      // The open weak points as they will stand once this session is saved.
      const resolvedNow = new Set(plan.untouched.filter((u) => u.resolve).map((u) => u.id));
      const byKey = new Map(existing.map((p) => [weakPointKey(p.category, p.pattern), p]));
      const open = existing
        .filter((p) => p.resolvedAt === null && !resolvedNow.has(p.id))
        .map((p) => ({ category: p.category, pattern: p.pattern, count: p.count, lastSeenAt: p.lastSeenAt, example: null as string | null }));
      for (const u of plan.upserts) {
        const key = weakPointKey(u.category, u.pattern);
        const prior = byKey.get(key);
        const entry = { category: u.category, pattern: u.pattern, count: (prior?.count ?? 0) + u.occurrences, lastSeenAt: new Date(), example: u.example };
        const i = open.findIndex((p) => weakPointKey(p.category, p.pattern) === key);
        if (i >= 0) open[i] = entry; else open.push(entry);
      }
      const hitKeys = new Set(plan.upserts.map((u) => weakPointKey(u.category, u.pattern)));
      const focus = selectFocusWeakPoints(open, hitKeys, PACK_FOCUS_COUNT);
      if (focus.length === 0 && context.corrections.length === 0) return { draft: null };

      const recent = db
        .select({ id: sessions.scenarioId })
        .from(sessions)
        .where(and(
          eq(sessions.userId, userId),
          eq(sessions.status, 'completed'),
          gt(sessions.completedAt, new Date(Date.now() - RECENT_SCENARIO_DAYS * 24 * 60 * 60 * 1000)),
        ));
      const candidates = await db
        .select({ id: scenarios.id, title: scenarios.title, difficulty: scenarios.difficulty })
        .from(scenarios)
        .where(and(
          isNull(scenarios.ownerUserId),
          isNotNull(scenarios.situationId),
          ne(scenarios.id, context.scenarioId),
          notInArray(scenarios.id, recent),
        ))
        .orderBy(desc(sql`${scenarios.difficulty} = ${context.difficulty}`), asc(scenarios.displayOrder))
        .limit(CANDIDATE_LIMIT);

      const usage = usageRecorder(userId, 'study-pack');
      const provider = await getAIProvider();
      const raw = await provider.generateJSON(
        buildStudyPackPrompt({
          targetLanguageName: getTargetLangConfig(context.targetLanguage).name,
          nativeLanguageName: getNativeLangName(context.nativeLanguage),
          difficulty: context.difficulty,
          scenarioTitle: context.scenarioTitle,
          corrections: context.corrections,
          focus,
          candidates,
          occupation: context.occupation,
          interests: context.interests,
        }),
        [],
        { modelTier: 'batch', maxTokens: PACK_MAX_TOKENS, onUsage: usage.onUsage },
      );
      await usage.flush();
      return { draft: parseStudyPack(raw, { focus, candidateIds: candidates.map((c) => c.id) }) };
    });

    const saved = await step.run('save', async () => {
      const { draft } = generated;
      return dbPool.transaction(async (tx) => {
        let packId: number | null = null;
        if (draft) {
          const [pack] = await tx
            .insert(studyPacks)
            .values({
              userId,
              sessionId,
              targetLanguage: context.targetLanguage,
              nativeLanguage: context.nativeLanguage,
              explanation: draft.explanation,
              recommendedScenarioId: draft.nextScenario?.id ?? null,
              recommendationReason: draft.nextScenario?.reason || null,
            })
            .onConflictDoNothing({ target: studyPacks.sessionId })
            .returning({ id: studyPacks.id });
          // Already saved by an earlier attempt, weak points included.
          if (!pack) return { packId: null, duplicate: true };
          packId = pack.id;
        }

        // Weak points. Recomputed inside the transaction from the same hits,
        // so the plan matches the rows it updates.
        const existing = await tx
          .select()
          .from(learnerWeakPoints)
          .where(and(eq(learnerWeakPoints.userId, userId), eq(learnerWeakPoints.targetLanguage, context.targetLanguage)));
        const plan = planWeakPointUpdates(existing, hits);
        const idByKey = new Map(existing.map((p) => [weakPointKey(p.category, p.pattern), p.id]));
        const now = new Date();
        for (const u of plan.upserts) {
          const [row] = await tx
            .insert(learnerWeakPoints)
            .values({
              userId,
              targetLanguage: context.targetLanguage,
              category: u.category,
              pattern: u.pattern,
              example: u.example,
              count: u.occurrences,
              lastSeenAt: now,
            })
            .onConflictDoUpdate({
              target: [learnerWeakPoints.userId, learnerWeakPoints.targetLanguage, learnerWeakPoints.category, learnerWeakPoints.pattern],
              set: {
                count: sql`${learnerWeakPoints.count} + ${u.occurrences}`,
                example: u.example,
                lastSeenAt: now,
                cleanSessionCount: 0,
                resolvedAt: null,
              },
            })
            .returning({ id: learnerWeakPoints.id });
          idByKey.set(weakPointKey(u.category, u.pattern), row.id);
        }
        for (const u of plan.untouched) {
          await tx
            .update(learnerWeakPoints)
            .set({ cleanSessionCount: u.cleanSessionCount, ...(u.resolve ? { resolvedAt: now } : {}) })
            .where(eq(learnerWeakPoints.id, u.id));
        }

        if (!draft || packId === null) return { packId: null, duplicate: false };

        const idByPattern = new Map([...idByKey].map(([key, id]) => [key.split('::')[1], id]));
        const items = [
          ...draft.focus.map((f) => ({ kind: 'focus', payload: f, weakPointId: idByKey.get(weakPointKey(f.category, f.pattern)) ?? null })),
          ...draft.drills.map((d) => ({ kind: 'drill', payload: d, weakPointId: idByPattern.get(d.pattern) ?? null })),
          ...draft.dialogues.map((d) => ({ kind: 'dialogue', payload: d, weakPointId: null })),
        ];
        const inserted = await tx
          .insert(studyPackItems)
          .values(items.map((item, i) => ({
            packId,
            userId,
            kind: item.kind,
            sequenceOrder: i + 1,
            weakPointId: item.weakPointId,
            payload: JSON.stringify(item.payload),
          })))
          .returning({ id: studyPackItems.id, sequenceOrder: studyPackItems.sequenceOrder });

        const cards = inserted.flatMap((row) => {
          const item = items[row.sequenceOrder - 1];
          const cardType = cardTypeForItem(item.kind);
          if (!cardType) return [];
          const payload = item.kind === 'drill'
            ? sentenceCard(item.payload as StudyPackDraft['drills'][number])
            : grammarCard(item.payload as StudyPackDraft['focus'][number]);
          return [{ userId, cardType, studyPackItemId: row.id, payload: JSON.stringify(payload) }];
        });
        if (cards.length > 0) await tx.insert(srsCards).values(cards).onConflictDoNothing();

        const dueAt = new Date();
        dueAt.setUTCHours(0, 0, 0, 0);
        dueAt.setUTCDate(dueAt.getUTCDate() + PACK_DUE_AFTER_DAYS);
        await tx.insert(calendarTasks).values({
          userId,
          title: `Study pack: ${context.learnerScenarioTitle}`.slice(0, 160),
          notes: draft.explanation.slice(0, 500),
          dueAt,
          allDay: true,
          kind: 'study_pack',
          sourceStudyPackId: packId,
          status: 'pending',
        });

        return { packId, duplicate: false };
      });
    });

    if (saved.packId !== null) {
      const packId = saved.packId;
      await step.run('notify', () => createNotification({
        userId,
        type: 'study_pack',
        title: 'Your study pack is ready',
        body: `Homework from "${context.learnerScenarioTitle}": drills and dialogues on what to fix next.`,
        href: `/study-packs/${packId}`,
      }));
    }

    return { packId: saved.packId, weakPointHits: hits.length };
  },
);
