import { db } from '../../../../src/db';
import { sessions, scenarios, conversations, corrections, evaluations, goalCompletions, scenarioGoals, vocabulary, situations, domains, characters, vocabularyEncounters } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq, asc, inArray, and, isNotNull, sql } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../../../../lib/cache';
import { AVATAR_SOURCES, applySessionAvatarIdentity } from '../../../../lib/avatar/catalog';
import { recordLessonActivity, resolveNextLesson } from '../../../../lib/courses/lesson-progress';
import { announceSessionCompleted } from '../../../../lib/study-packs/server';
import {
  isAbandonmentReason,
} from '../../../../lib/roleplay/session-lifecycle';
import {
  getTargetScenarioLocalization,
  getTargetSituationLocalization,
  getTargetGoalLocalizations,
  applyScenarioLocalization,
  applySituationLocalization,
  applyGoalLocalization,
  resolveNativeScenarioLocalization,
  resolveNativeSituationLocalization,
  localizeGoalsForLearner,
  localizeVocabularyForLearner,
} from '../../../../lib/localization';
import { BASE_CONTENT_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '../../../../lib/language';

type ScenarioRow = typeof scenarios.$inferSelect;
type SituationRow = typeof situations.$inferSelect;
type CharacterRow = typeof characters.$inferSelect;
type VocabRow = typeof vocabulary.$inferSelect;
type GoalRow = typeof scenarioGoals.$inferSelect;
type DomainRow = typeof domains.$inferSelect;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [
    scenario,
    situation,
    character,
    conversationList,
    evaluationResult,
    goalCompletionList,
    avgPronunciationScore,
    newWordsCount,
  ] = await Promise.all([
    session.scenarioId
      ? (async (): Promise<ScenarioRow | null> => {
          const k = cacheKeys.scenario(session.scenarioId!);
          const c = await cacheGet<ScenarioRow | null>(k);
          if (c) return c;
          const r = await db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId!)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.SCENARIO);
          return r;
        })()
      : Promise.resolve(null),

    session.situationId
      ? (async (): Promise<SituationRow | null> => {
          const k = cacheKeys.situation(session.situationId!);
          const c = await cacheGet<SituationRow | null>(k);
          if (c) return c;
          const r = await db.select().from(situations).where(eq(situations.id, session.situationId!)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.SITUATION);
          return r;
        })()
      : Promise.resolve(null),

    session.characterId
      ? (async (): Promise<CharacterRow | null> => {
          const k = cacheKeys.character(session.characterId!);
          const c = await cacheGet<CharacterRow | null>(k);
          if (c) return c;
          const r = await db.select().from(characters).where(eq(characters.id, session.characterId!)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.CHARACTER);
          return r;
        })()
      : Promise.resolve(null),

    db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))
      .orderBy(asc(conversations.turnNo)),

    db
      .select()
      .from(evaluations)
      .where(eq(evaluations.sessionId, sessionId))
      .then(r => r[0] ?? null),

    db
      .select({
        id: goalCompletions.id,
        conversationId: goalCompletions.conversationId,
        scenarioGoalId: goalCompletions.scenarioGoalId,
        achieved: goalCompletions.achieved,
        evidenceNote: goalCompletions.evidenceNote,
        goalText: scenarioGoals.goalText,
        goalType: scenarioGoals.goalType,
        sequenceOrder: scenarioGoals.sequenceOrder,
      })
      .from(goalCompletions)
      .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
      .where(eq(goalCompletions.sessionId, sessionId)),

    // Real average pronunciation-assessment score for this session (Azure
    // Speech SDK, populated per-turn in vocabularyEncounters). Null when the
    // session never produced a voice pronunciation score (e.g. text-only).
    db
      .select({ value: sql<number | null>`avg(${vocabularyEncounters.accuracyScore})` })
      .from(vocabularyEncounters)
      .where(and(eq(vocabularyEncounters.sessionId, sessionId), isNotNull(vocabularyEncounters.accuracyScore)))
      .then(r => {
        const v = r[0]?.value;
        return v == null ? null : Math.round(Number(v));
      }),

    // Distinct vocabulary items the learner used correctly this session.
    db
      .select({ value: sql<number>`count(distinct ${vocabularyEncounters.vocabularyId})` })
      .from(vocabularyEncounters)
      .where(and(eq(vocabularyEncounters.sessionId, sessionId), eq(vocabularyEncounters.usedCorrectly, true)))
      .then(r => Number(r[0]?.value ?? 0)),
  ]);

  const [vocabItems, goals, domainResult] = await Promise.all([
    scenario
      ? (async (): Promise<VocabRow[]> => {
          const lang = session.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
          const k = cacheKeys.vocabulary(scenario.id, lang);
          const c = await cacheGet<VocabRow[]>(k);
          if (c) return c;
          const languages = lang === BASE_CONTENT_LANGUAGE ? [BASE_CONTENT_LANGUAGE] : [BASE_CONTENT_LANGUAGE, lang];
          const r = await db.select().from(vocabulary).where(and(eq(vocabulary.scenarioId, scenario.id), inArray(vocabulary.languageCode, languages)));
          await cacheSet(k, r, TTL.VOCABULARY);
          return r;
        })()
      : Promise.resolve([]),

    scenario
      ? (async (): Promise<GoalRow[]> => {
          const k = cacheKeys.goals(scenario.id);
          const c = await cacheGet<GoalRow[]>(k);
          if (c) return c;
          const r = await db.select().from(scenarioGoals).where(eq(scenarioGoals.scenarioId, scenario.id)).orderBy(asc(scenarioGoals.sequenceOrder));
          await cacheSet(k, r, TTL.GOALS);
          return r;
        })()
      : Promise.resolve([]),

    situation
      ? (async (): Promise<DomainRow | null> => {
          const k = cacheKeys.domain(situation.domainId);
          const c = await cacheGet<DomainRow | null>(k);
          if (c) return c;
          const r = await db.select().from(domains).where(eq(domains.id, situation.domainId)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.DOMAIN);
          return r;
        })()
      : Promise.resolve(null),
  ]);

  const conversationIds = conversationList.map(c => c.id);
  const allCorrections = conversationIds.length > 0
    ? await db
        .select()
        .from(corrections)
        .where(inArray(corrections.conversationId, conversationIds))
    : [];

  const correctionsByConvId = new Map<number, typeof allCorrections>();
  for (const c of allCorrections) {
    const arr = correctionsByConvId.get(c.conversationId);
    if (arr) arr.push(c);
    else correctionsByConvId.set(c.conversationId, [c]);
  }

  const conversationWithCorrections = conversationList.map(conv => ({
    ...conv,
    corrections: correctionsByConvId.get(conv.id) ?? [],
  }));

  // What the learner reads is the TARGET scene (the one the AI plays, see
  // analyze-turn) explained in their NATIVE language. Target layer first —
  // setting, character names, the phrases to say — then the native
  // explanation over it, resolved per (target, native) pair. Each resolver
  // falls back native → English → base on its own, so a missing row never
  // mixes languages silently (it logs).
  let localizedScenario = scenario;
  let localizedSituation = situation;
  let localizedGoals = goals;
  const nativeLang = session.nativeLanguage ?? 'en';
  const targetLang = session.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  const isBaseTarget = targetLang === BASE_CONTENT_LANGUAGE;
  const [targetScenarioLoc, nativeScenarioLoc, targetSituationLoc, nativeSituationLoc, targetGoalLocs] = await Promise.all([
    scenario && !isBaseTarget ? getTargetScenarioLocalization(scenario.id, targetLang) : Promise.resolve(null),
    scenario ? resolveNativeScenarioLocalization(scenario.id, targetLang, nativeLang) : Promise.resolve(null),
    situation && !isBaseTarget ? getTargetSituationLocalization(situation.id, targetLang) : Promise.resolve(null),
    situation ? resolveNativeSituationLocalization(situation.id, targetLang, nativeLang) : Promise.resolve(null),
    scenario && !isBaseTarget ? getTargetGoalLocalizations(scenario.id, targetLang) : Promise.resolve(new Map()),
  ]);
  if (localizedScenario) {
    localizedScenario = applyScenarioLocalization(localizedScenario, targetScenarioLoc);
    localizedScenario = applyScenarioLocalization(localizedScenario, nativeScenarioLoc);
  }
  if (localizedSituation) {
    localizedSituation = applySituationLocalization(localizedSituation, targetSituationLoc);
    localizedSituation = applySituationLocalization(localizedSituation, nativeSituationLoc);
  }
  if (scenario && localizedGoals.length > 0) {
    localizedGoals = localizedGoals.map((g) => applyGoalLocalization(g, targetGoalLocs.get(g.id) ?? null));
    localizedGoals = await localizeGoalsForLearner(scenario.id, localizedGoals, targetLang, nativeLang);
  }
  const localizedVocab = scenario
    ? await localizeVocabularyForLearner(scenario.id, vocabItems, targetLang, nativeLang)
    : vocabItems;

  // Per-session avatar override — resolves the catalog entry the user picked
  // in the two-card picker. Keeps historical sessions isolated even when the
  // shared `scenarios` row is reused across many sessions/situations.
  const selectedAvatarId = session.selectedAvatarId;
  const selectedAvatar = selectedAvatarId ? AVATAR_SOURCES.find(a => a.id === selectedAvatarId) ?? null : null;
  // Surface the override on the scenario so every consumer (report, title,
  // transcript header) sees the right name/role without mutating the shared row.
  const scenarioForClient = localizedScenario
    ? applySessionAvatarIdentity(localizedScenario, selectedAvatarId)
    : null;

  // Where "Continue" should go when this session finishes. Only a course
  // lesson has an answer; a free-form session returns null and the completion
  // screen keeps its /home exit.
  const nextLesson = session.lessonId
    ? await resolveNextLesson(user.id, session.lessonId, targetLang)
    : null;

  return Response.json({
    success: true,
    session,
    nextLesson,
    scenario: scenarioForClient,
    situation: localizedSituation,
    domain: domainResult,
    character,
    selectedAvatar,
    vocabulary: localizedVocab,
    goals: localizedGoals,
    conversations: conversationWithCorrections,
    evaluation: evaluationResult,
    goalCompletions: goalCompletionList,
    avgPronunciationScore,
    newWordsCount,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));

  return Response.json({ success: true, message: 'Session deleted' });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { status } = body;

  const updateData: Partial<typeof sessions.$inferInsert> = {};

  if (body.avatarEnabled !== undefined) {
    if (typeof body.avatarEnabled !== 'boolean') {
      return Response.json({ error: 'avatarEnabled must be a boolean' }, { status: 400 });
    }
    updateData.avatarEnabled = body.avatarEnabled;
  }

  if (body.completionAcknowledged !== undefined) {
    if (typeof body.completionAcknowledged !== 'boolean') {
      return Response.json({ error: 'completionAcknowledged must be a boolean' }, { status: 400 });
    }
    updateData.completionAcknowledged = body.completionAcknowledged;
  }

  if (body.activeDurationSeconds !== undefined) {
    if (typeof body.activeDurationSeconds !== 'number' || !Number.isFinite(body.activeDurationSeconds) || body.activeDurationSeconds < 0) {
      return Response.json({ error: 'activeDurationSeconds must be a non-negative number' }, { status: 400 });
    }
    const incoming = Math.min(Math.floor(body.activeDurationSeconds), 7 * 24 * 3600);
    updateData.activeDurationSeconds = Math.max(session.activeDurationSeconds ?? 0, incoming);
  }

  if (body.abandonmentReason !== undefined) {
    if (body.abandonmentReason !== null && !isAbandonmentReason(body.abandonmentReason)) {
      return Response.json({ error: 'Invalid abandonmentReason' }, { status: 400 });
    }
    if (session.status !== 'abandoned' && status !== 'abandoned') {
      return Response.json({ error: 'abandonmentReason can only be set on an abandoned session' }, { status: 400 });
    }
    updateData.abandonmentReason = body.abandonmentReason;
  }

  if (status) {
    if (!['active', 'paused', 'completed', 'abandoned'].includes(status)) {
      return Response.json({ error: 'Invalid status value' }, { status: 400 });
    }

    // A scored finish cannot be undone or converted into a quit.
    if (session.status === 'completed' && status !== 'completed') {
      return Response.json({ error: 'Completed sessions cannot change status' }, { status: 400 });
    }
    // Quit → Save Session is allowed. Quit → scored complete is not.
    if (session.status === 'abandoned' && status !== 'abandoned' && status !== 'paused') {
      return Response.json({ error: 'Abandoned sessions can only be restored to paused' }, { status: 400 });
    }
    if (status === 'abandoned' && session.status === 'completed') {
      return Response.json({ error: 'Completed sessions cannot be abandoned' }, { status: 400 });
    }

    updateData.status = status;
    if (status === 'completed' || status === 'abandoned') {
      updateData.completedAt = new Date();
    } else if (status === 'active' || status === 'paused') {
      updateData.completedAt = null;
    }
    if (status === 'paused' && session.status === 'abandoned') {
      updateData.abandonmentReason = null;
    }
  }

  updateData.lastActiveAt = new Date();

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await db.update(sessions).set(updateData).where(eq(sessions.id, sessionId));

  if (status === 'completed' && session.status !== 'completed') {
    await announceSessionCompleted({ sessionId, userId: user.id });
  }

  // A course lesson is complete when its linked session completes.
  if (status === 'completed' && session.lessonId) {
    try {
      await recordLessonActivity({
        userId: user.id,
        lessonId: session.lessonId,
        phaseKey: 'evaluation',
        complete: true,
        score: session.vocabularyScore ?? null,
        targetLanguage: session.targetLanguage,
        nativeLanguage: session.nativeLanguage,
      });
    } catch (err) {
      console.error('[session-complete] failed to record lesson progress', { sessionId, lessonId: session.lessonId, error: String(err) });
    }
  }

  return Response.json({ success: true });
}
