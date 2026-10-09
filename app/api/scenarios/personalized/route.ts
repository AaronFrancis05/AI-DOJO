import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import {
  learnerWeakPoints,
  scenarioGoalNativeLocalizations,
  scenarioGoals,
  scenarioLocalizations,
  scenarioNativeLocalizations,
  scenarios,
  users,
  vocabulary,
  vocabularyLocalizations,
  vocabularyNativeNotes,
} from '@/src/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getAIProvider, AIProviderError } from '@/lib/ai-providers';
import { hasBatchQuota, usageRecorder } from '@/lib/ai-usage';
import { DEFAULT_TARGET_LANGUAGE, getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { loadLanguageCatalog } from '@/lib/language-registry';
import { getLearnerProficiency, resolveDifficulty } from '@/lib/roleplay/proficiency';
import { STUDY_PACKS_ENABLED, SCENARIO_MAX_TOKENS } from '@/lib/study-packs/config';
import { parseInterests } from '@/lib/study-packs/profile';
import {
  MAX_TOPIC_LENGTH,
  buildPersonalizedScenarioPrompt,
  parsePersonalizedScenario,
  type PersonalizedScenarioDraft,
} from '@/lib/study-packs/personalized-scenario';

const FOCUS_WEAK_POINTS = 3;

/**
 * Writes a scenario for this learner alone (PLAN.md 3.4) and returns its id.
 * The client starts the session through POST /api/sessions, which only
 * accepts an owned scenario from its owner.
 *
 * Body: `{ topic?: string }` — what they want to practise, optional.
 * Counts against the daily batch quota (lib/ai-usage.ts).
 */
export async function POST(req: Request) {
  if (!STUDY_PACKS_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const authUser = await getAuthUser();
  if (!authUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { topic?: unknown };
  const topic = typeof body.topic === 'string' ? body.topic.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_LENGTH) || null : null;

  const [profile] = await db
    .select({
      tier: users.tier,
      level: users.level,
      occupation: users.occupation,
      interests: users.interests,
      targetLanguage: users.preferredTargetLanguage,
      nativeLanguage: users.nativeLanguage,
    })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);
  if (!profile) return Response.json({ error: 'User not found' }, { status: 404 });

  if (!(await hasBatchQuota(authUser.id, profile.tier))) {
    return Response.json(
      { error: "You've reached today's limit for generated practice. Try again tomorrow." },
      { status: 429 },
    );
  }

  await loadLanguageCatalog();
  const targetLanguage = profile.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  const nativeLanguage = profile.nativeLanguage ?? 'en';
  const [weakPoints, proficiency] = await Promise.all([
    db
      .select({ category: learnerWeakPoints.category, pattern: learnerWeakPoints.pattern })
      .from(learnerWeakPoints)
      .where(and(
        eq(learnerWeakPoints.userId, authUser.id),
        eq(learnerWeakPoints.targetLanguage, targetLanguage),
        isNull(learnerWeakPoints.resolvedAt),
      ))
      .orderBy(desc(learnerWeakPoints.count))
      .limit(FOCUS_WEAK_POINTS),
    getLearnerProficiency(authUser.id, targetLanguage),
  ]);
  const difficulty = resolveDifficulty(profile.level, proficiency);

  const input = {
    targetLanguage,
    targetLanguageName: getTargetLangConfig(targetLanguage).name,
    nativeLanguage,
    nativeLanguageName: getNativeLangName(nativeLanguage),
    difficulty,
    occupation: profile.occupation,
    interests: parseInterests(profile.interests),
    weakPoints,
    topic,
  };

  let draft: PersonalizedScenarioDraft;
  const usage = usageRecorder(authUser.id, 'scenario/personalized');
  try {
    const provider = await getAIProvider();
    const raw = await provider.generateJSON(buildPersonalizedScenarioPrompt(input), [], {
      modelTier: 'batch',
      maxTokens: SCENARIO_MAX_TOKENS,
      onUsage: usage.onUsage,
    });
    draft = parsePersonalizedScenario(raw, input);
  } catch (err) {
    console.error('[scenario/personalized] generation failed', err instanceof AIProviderError ? err.verboseLog : err);
    return Response.json({ error: 'Could not write a scenario right now. Please try again.' }, { status: 502 });
  }

  const scenarioId = await dbPool.transaction(async (tx) => {
    const [scenario] = await tx.insert(scenarios).values({
      title: draft.base.title,
      context: draft.base.context,
      businessType: draft.base.businessType,
      difficulty,
      aiCharacterName: draft.base.aiCharacterName,
      aiCharacterRole: draft.base.aiCharacterRole,
      userCharacterName: 'You',
      userCharacterRole: draft.base.userCharacterRole,
      learningGoals: draft.base.learningGoals,
      ownerUserId: authUser.id,
    }).returning({ id: scenarios.id });

    if (draft.targetScene) {
      await tx.insert(scenarioLocalizations).values({
        scenarioId: scenario.id,
        languageCode: targetLanguage,
        ...draft.targetScene,
        aiCharacterName: draft.base.aiCharacterName,
      });
    }
    if (draft.native) {
      await tx.insert(scenarioNativeLocalizations).values({
        scenarioId: scenario.id,
        targetLanguage,
        nativeLanguage,
        ...draft.native,
      });
    }

    const goalRows = await tx.insert(scenarioGoals).values(draft.goals.map((g, i) => ({
      scenarioId: scenario.id,
      sequenceOrder: i + 1,
      goalText: g.goalText,
      goalType: 'custom',
      targetPhrase: g.targetPhrase,
      languageCode: targetLanguage,
    }))).returning({ id: scenarioGoals.id, sequenceOrder: scenarioGoals.sequenceOrder });
    const nativeGoals = goalRows
      .map((row) => ({ row, goalNative: draft.goals[row.sequenceOrder - 1]?.goalNative }))
      .filter((g): g is { row: typeof g.row; goalNative: string } => Boolean(g.goalNative));
    if (draft.native && nativeGoals.length > 0) {
      await tx.insert(scenarioGoalNativeLocalizations).values(nativeGoals.map((g) => ({
        scenarioGoalId: g.row.id,
        targetLanguage,
        nativeLanguage,
        goalText: g.goalNative,
      })));
    }

    // The word is authored in the target language and its meaning in the
    // learner's, so the gloss resolver (lib/native-gloss.ts) finds it for
    // every native language: `translation` for English and as the fallback,
    // the native row for the rest, and the usage tip as a native note.
    const vocabRows = await tx.insert(vocabulary).values(draft.vocabulary.map((v) => ({
      scenarioId: scenario.id,
      targetText: v.targetText,
      phonetic: v.phonetic || null,
      translation: v.translation,
      languageCode: targetLanguage,
      category: v.category,
      usageTip: v.usageTip || null,
      formalityLevel: v.formalityLevel,
    }))).returning({ id: vocabulary.id });
    if (nativeLanguage !== 'en' && nativeLanguage !== targetLanguage) {
      await tx.insert(vocabularyLocalizations).values(vocabRows.map((row, i) => ({
        vocabularyId: row.id,
        languageCode: nativeLanguage,
        translation: draft.vocabulary[i].translation,
        usageTip: draft.vocabulary[i].usageTip || null,
      })));
    }
    if (nativeLanguage !== targetLanguage) {
      const notes = vocabRows
        .map((row, i) => ({ vocabularyId: row.id, usageTip: draft.vocabulary[i].usageTip }))
        .filter((n) => n.usageTip);
      if (notes.length > 0) {
        await tx.insert(vocabularyNativeNotes).values(notes.map((n) => ({ ...n, targetLanguage, nativeLanguage })));
      }
    }

    return scenario.id;
  });

  return Response.json({ success: true, scenarioId }, { status: 201 });
}
