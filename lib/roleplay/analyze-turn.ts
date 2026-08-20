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
import { getAIProvider, type ChatTurn } from '../ai-providers';
import { getTargetLangConfig, getNativeLangName } from '../language';
import type { SessionPhase } from './phase-engine';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../cache';
import {
  getScenarioLocalization,
  getScenarioVocabLocalizations,
  applyScenarioLocalization,
  getTargetScenarioLocalization,
  getTargetVocabLocalizations,
  applyTargetLanguageVocab,
} from '../localization';

export const MAX_ICEBREAKER_VOCAB = 5;

type SessionRow = typeof sessions.$inferSelect;
type ScenarioRow = typeof scenarios.$inferSelect;
type SituationRow = typeof situations.$inferSelect;
type GoalRow = typeof scenarioGoals.$inferSelect;

async function generateAndPersistMissingVocabulary(
  scenario: ScenarioRow,
  existingVocab: typeof vocabulary.$inferSelect[],
  targetLanguage: string,
  nativeLanguage: string,
): Promise<typeof vocabulary.$inferSelect[]> {
  const neededCount = MAX_ICEBREAKER_VOCAB - existingVocab.length;
  if (neededCount <= 0) return existingVocab;

  const targetLangName = getTargetLangConfig(targetLanguage).name;
  const nativeLangName = getNativeLangName(nativeLanguage);
  const showPhonetic = getTargetLangConfig(targetLanguage).hasPhonetic && targetLanguage === 'ja';

  try {
    const provider = await getAIProvider();
    const prompt = `Generate exactly ${neededCount} essential vocabulary words or short phrases for a language learner in the following roleplay scenario.

Scenario Title: ${scenario.title}
Context/Setting: ${scenario.context}
Learning Goals: ${scenario.learningGoals}
Target Language: ${targetLangName}
Native Language: ${nativeLangName}
Existing words (do not duplicate): ${existingVocab.map(v => v.targetText).join(', ') || 'None'}

Return a JSON array of ${neededCount} objects strictly matching this format:
[
  {
    "targetText": "Word or short phrase in ${targetLangName}",
    "phonetic": ${showPhonetic ? '"Phonetic romaji pronunciation"' : 'null'},
    "translation": "Meaning in ${nativeLangName}",
    "category": "greeting|phrase|noun|verb",
    "usageTip": "Short practical tip for using this in the scenario"
  }
]`;

    const raw = await provider.generateJSON(prompt, []);
    const items = JSON.parse(raw) as Array<{
      targetText?: string;
      phonetic?: string | null;
      translation?: string;
      category?: string;
      usageTip?: string | null;
    }>;
    if (Array.isArray(items) && items.length > 0) {
      // Reject description-like or clearly broken targetText entries (e.g. a
      // full sentence "A polite expression used when..." instead of an actual
      // word/phrase) so the icebreaker never drills garbage. A real word or
      // short phrase stays under ~6 words and contains no sentence punctuation.
      const looksLikeWordOrPhrase = (t: string) => {
        const text = String(t).trim();
        if (!text) return false;
        if (/[.!?;]$/.test(text)) return false;
        return text.split(/\s+/).length <= 6;
      };
      const validItems = items.filter(item => item && item.targetText && looksLikeWordOrPhrase(item.targetText));
      if (validItems.length > 0) {
        const inserted = await db.insert(vocabulary).values(
          validItems.slice(0, neededCount).map((item) => ({
            scenarioId: scenario.id,
            targetText: String(item.targetText || '').trim(),
            phonetic: item.phonetic ? String(item.phonetic).trim() : null,
            translation: String(item.translation || '').trim(),
            languageCode: targetLanguage,
            category: item.category ? String(item.category).trim() : 'phrase',
            usageTip: item.usageTip ? String(item.usageTip).trim() : null,
          }))
        ).returning();

        const combined = [...existingVocab, ...inserted];
        await cacheSet(cacheKeys.vocabulary(scenario.id), combined, TTL.VOCABULARY);
        return combined;
      }
    }
  } catch (err) {
    console.error('[VOCABULARY GENERATION] Failed to generate missing vocabulary:', err);
  }

  return existingVocab;
}

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
  /** True when a curated localization row exists for this scenario in the session's native or target language. */
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

  let vocabRows = currentPhase === 'orientation' || currentPhase === 'icebreaker' || currentPhase === 'guided'
    ? await (async (): Promise<typeof vocabulary.$inferSelect[]> => {
        const k = cacheKeys.vocabulary(scenarioId);
        const c = await cacheGet<typeof vocabulary.$inferSelect[]>(k);
        if (c && c.length >= MAX_ICEBREAKER_VOCAB) return c;
        let r = await db.select().from(vocabulary).where(eq(vocabulary.scenarioId, scenarioId)).orderBy(vocabulary.id);
        if (r.length < MAX_ICEBREAKER_VOCAB && currentScenario) {
          r = await generateAndPersistMissingVocabulary(currentScenario, r, targetLanguage, nativeLanguage);
        }
        await cacheSet(k, r, TTL.VOCABULARY);
        return r;
      })()
    : [];

  if ((currentPhase === 'icebreaker' || currentPhase === 'orientation') && vocabRows.length > MAX_ICEBREAKER_VOCAB) {
    vocabRows = vocabRows.slice(0, MAX_ICEBREAKER_VOCAB);
  }

  let scenarioLocalized = false;

  const scenarioLocs = await Promise.all([
    nativeLanguage !== 'en' ? getScenarioLocalization(scenarioId, nativeLanguage) : Promise.resolve(null),
    targetLanguage && targetLanguage !== 'en' ? getTargetScenarioLocalization(scenarioId, targetLanguage) : Promise.resolve(null),
  ]);

  if (currentScenario) {
    // Native-language scenario localization (the base scenario fields are
    // English) so a learner who doesn't speak English still gets a scenario
    // they can understand.
    const nativeLoc = scenarioLocs[0];
    if (nativeLoc) {
      currentScenario = applyScenarioLocalization(currentScenario, nativeLoc);
      scenarioLocalized = true;
    }

    // Target-language scenario localization (e.g. French context and
    // character names for a French course). Applied last so the roleplay
    // content matches the language the student is actually learning.
    const targetLoc = scenarioLocs[1];
    if (targetLoc) {
      currentScenario = applyScenarioLocalization(currentScenario, targetLoc);
      scenarioLocalized = true;
    }
  }

  if (currentScenario && vocabRows.length > 0) {
    const [nativeVocabLoc, targetVocabLoc] = await Promise.all([
      nativeLanguage !== 'en'
        ? getScenarioVocabLocalizations(scenarioId, nativeLanguage)
        : Promise.resolve(new Map<number, { translation: string | null; usageTip: string | null }>()),
      targetLanguage
        ? getTargetVocabLocalizations(scenarioId, targetLanguage)
        : Promise.resolve(new Map<number, { translation: string | null; usageTip: string | null }>()),
    ]);

    if (nativeVocabLoc.size > 0) {
      // Native-language meaning shown alongside the word being learned.
      vocabRows = vocabRows.map((v) => {
        const localized = nativeVocabLoc.get(v.id);
        if (!localized) return v;
        return {
          ...v,
          translation: localized.translation ?? v.translation,
          usageTip: localized.usageTip ?? v.usageTip,
        };
      });
    }

    if (targetVocabLoc.size > 0) {
      // Target-language word/phrase replaces the Japanese base targetText so
      // a French (or English, etc.) course drills the correct words.
      vocabRows = applyTargetLanguageVocab(vocabRows, targetVocabLoc);
    } else if (targetLanguage === 'en') {
      // The base vocabulary rows are Japanese but their `translation` column
      // is English (the seed's meaning). For an English-target course with no
      // curated 'en' localizations, drill the English translation directly
      // instead of falling back to the Japanese base text.
      vocabRows = vocabRows.map((v) => ({
        ...v,
        targetText: v.translation,
        usageTip: v.usageTip,
      }));
    } else if (targetLanguage && targetLanguage !== 'ja') {
      // Loud, not silent: a non-Japanese target with no vocab localizations
      // would otherwise drill the base Japanese words with no signal.
      console.warn(
        `[LOCALIZATION] Scenario ${scenarioId} has ${vocabRows.length} vocabulary item(s) but NO ${targetLanguage} ` +
          `localizations — the lesson will drill the base Japanese text. Run: npm run db:localize -- --lang=${targetLanguage}`,
      );
    }
  }

  if (currentScenario && !scenarioLocalized && nativeLanguage !== 'en') {
    console.warn(
      `[LOCALIZATION] Scenario ${scenarioId} has no ${nativeLanguage} scenario localization and native language is ` +
        `not English — instructional text will fall back to English. Run: npm run db:localize -- --native-lang=${nativeLanguage}`,
    );
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
