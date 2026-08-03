import { db } from '../../src/db';
import {
  sessions,
  conversations,
  scenarios,
  situations,
  scenarioGoals,
  goalCompletions,
  vocabulary,
} from '../../src/schema';
import { eq, and, asc } from 'drizzle-orm';
import { analyzeUserTurn, type UserTurnAnalysis } from '../ai-engine';
import type { ChatTurn } from '../ai-providers';
import type { SessionPhase } from './phase-engine';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../cache';
import {
  getScenarioLocalization,
  getScenarioVocabLocalizations,
  applyScenarioLocalization,
} from '../localization';

export const MAX_ICEBREAKER_VOCAB = 5;

type SessionRow = typeof sessions.$inferSelect;
type ScenarioRow = typeof scenarios.$inferSelect;
type SituationRow = typeof situations.$inferSelect;
type GoalRow = typeof scenarioGoals.$inferSelect;

export interface SessionTurnData {
  session: SessionRow;
  scenario: ScenarioRow | null;
  situation: SituationRow | null;
  goals: GoalRow[];
  completedSequenceOrders: number[];
  conversationHistory: ChatTurn[];
  currentTurnNo: number;
  userTurnCount: number;
  vocabRows: typeof vocabulary.$inferSelect[];
  behaviorMode: string;
  targetLanguage: string;
  nativeLanguage: string;
  isSameLanguage: boolean;
  /** True when a curated localization row exists for this scenario in the session's native language. */
  scenarioLocalized: boolean;
  currentPhase: SessionPhase;
}

/**
 * Loads every piece of data a turn needs (scenario, situation, goals,
 * completions, history, vocab) from the DB, applying the shared cache
 * and the icebreaker vocab cap. Used by both the streaming route and the
 * standalone analyze endpoint so the two never drift apart.
 */
export async function loadSessionTurnData(session: SessionRow): Promise<SessionTurnData> {
  const { scenarioId } = session;

  let currentScenario = await (async (): Promise<ScenarioRow | null> => {
      const k = cacheKeys.scenario(scenarioId);
      const c = await cacheGet<ScenarioRow | null>(k);
      if (c) return c;
      const r = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).then(r => r[0] ?? null);
      if (r) await cacheSet(k, r, TTL.SCENARIO);
      return r;
    })();

  const [conversationRows, goalsResult, completionsResult, situationResult] = await Promise.all([
    db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, session.id))
      .orderBy(asc(conversations.turnNo)),

    (async (): Promise<GoalRow[]> => {
      const k = cacheKeys.goals(scenarioId);
      const c = await cacheGet<GoalRow[]>(k);
      if (c) return c;
      const r = await db.select().from(scenarioGoals).where(eq(scenarioGoals.scenarioId, scenarioId)).orderBy(asc(scenarioGoals.sequenceOrder));
      await cacheSet(k, r, TTL.GOALS);
      return r;
    })(),

    db
      .select({ seqOrder: scenarioGoals.sequenceOrder })
      .from(goalCompletions)
      .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
      .where(and(eq(goalCompletions.sessionId, session.id), eq(scenarioGoals.scenarioId, scenarioId))),

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
  ]);

  const goals = goalsResult;
  const completedSequenceOrders = completionsResult.map(c => c.seqOrder);

  const currentTurnNo = conversationRows.length > 0
    ? Math.max(...conversationRows.map(c => c.turnNo)) + 1
    : 1;

  const conversationHistory: ChatTurn[] = conversationRows.map(row => ({
    role: row.speaker === 'ai' ? 'assistant' as const : 'user' as const,
    content: row.messageNative ?? row.messageTarget,
  }));

  const userTurnCount = conversationRows.filter(c => c.speaker === 'user').length;

  const behaviorMode = session.behaviorMode ?? 'standard';
  const targetLanguage = session.targetLanguage ?? 'ja';
  const nativeLanguage = session.nativeLanguage ?? 'en';
  const isSameLanguage = targetLanguage === nativeLanguage;
  const currentPhase = session.phase as SessionPhase;

  let vocabRows = currentPhase === 'icebreaker' || currentPhase === 'guided'
    ? await (async (): Promise<typeof vocabulary.$inferSelect[]> => {
        const k = cacheKeys.vocabulary(scenarioId);
        const c = await cacheGet<typeof vocabulary.$inferSelect[]>(k);
        if (c) return c;
        const r = await db.select().from(vocabulary).where(eq(vocabulary.scenarioId, scenarioId)).orderBy(vocabulary.id);
        await cacheSet(k, r, TTL.VOCABULARY);
        return r;
      })()
    : [];

  if (currentPhase === 'icebreaker' && vocabRows.length > MAX_ICEBREAKER_VOCAB) {
    vocabRows = vocabRows.slice(0, MAX_ICEBREAKER_VOCAB);
  }

  let scenarioLocalized = false;
  if (nativeLanguage !== 'en' && currentScenario) {
    const [scenarioLoc, vocabLoc] = await Promise.all([
      getScenarioLocalization(scenarioId, nativeLanguage),
      vocabRows.length > 0 ? getScenarioVocabLocalizations(scenarioId, nativeLanguage) : Promise.resolve(new Map<number, { translation: string | null; usageTip: string | null }>()),
    ]);

    if (scenarioLoc) {
      currentScenario = applyScenarioLocalization(currentScenario, scenarioLoc);
      scenarioLocalized = true;
    }

    if (vocabLoc.size > 0) {
      vocabRows = vocabRows.map((v) => {
        const localized = vocabLoc.get(v.id);
        if (!localized) return v;
        return {
          ...v,
          translation: localized.translation ?? v.translation,
          usageTip: localized.usageTip ?? v.usageTip,
        };
      });
    }
  }

  return {
    session,
    scenario: currentScenario,
    situation: situationResult,
    goals,
    completedSequenceOrders,
    conversationHistory,
    currentTurnNo,
    userTurnCount,
    vocabRows,
    behaviorMode,
    targetLanguage,
    nativeLanguage,
    isSameLanguage,
    scenarioLocalized,
    currentPhase,
  };
}

/**
 * Runs the non-streaming analysis (corrections, scores, goals) for a turn.
 * The caller is responsible for confirming the scenario exists before passing
 * it in.
 */
export async function analyzeTurn(input: {
  userInput: string;
  aiReplyText?: string;
  scenario: ScenarioRow;
  data: SessionTurnData;
}): Promise<UserTurnAnalysis> {
  const { userInput, aiReplyText, scenario, data } = input;
  const situationContext = data.situation && !data.scenarioLocalized ? data.situation.context : scenario.context;
  const situationLearningGoals = data.situation && !data.scenarioLocalized ? data.situation.learningGoals : scenario.learningGoals;

  return analyzeUserTurn(
    userInput,
    aiReplyText ?? '',
    data.currentTurnNo,
    scenario,
    data.goals,
    data.completedSequenceOrders,
    data.conversationHistory,
    data.behaviorMode,
    situationContext,
    situationLearningGoals,
    data.targetLanguage,
    data.nativeLanguage,
  );
}
