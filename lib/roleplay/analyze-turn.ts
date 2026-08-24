import { db } from '../../src/db';
import {
  sessions,
  conversations,
  scenarios,
  situations,
  scenarioGoals,
  goalCompletions,
  vocabulary,
  users,
  countries,
} from '../../src/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { analyzeUserTurn, type UserTurnAnalysis } from '../ai-engine';
import { getAIProvider, type ChatTurn } from '../ai-providers';
import { buildConversationHistory } from './conversation-history';
import { getLearnerProficiency, resolveDifficulty } from './proficiency';
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
  getSituationLocalization,
  getTargetSituationLocalization,
  applySituationLocalization,
  getTargetGoalLocalizations,
  applyGoalLocalization,
} from '../localization';
import { applySessionAvatarIdentity } from '../avatar/catalog';

export const MAX_ICEBREAKER_VOCAB = 5;

/**
 * Scenario+language pairs with a background vocabulary top-up already running.
 *
 * The background call is deliberately not awaited, so nothing downstream slows
 * for it — but that also means the next turn arrives before it finishes and
 * sees the same short list. Without this guard every turn of a thin scenario
 * launches another generation, so one learner can have several LLM calls
 * writing the same rows at once.
 */
const vocabTopUpInFlight = new Set<string>();

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
      // short phrase stays under ~6 words and contains no sentence punctuation
      // (including CJK sentence-final marks). Translations must be non-empty —
      // a whitespace-only translation would otherwise be persisted and drilled.
      const looksLikeWordOrPhrase = (t: string) => {
        const text = String(t).trim();
        if (!text) return false;
        if (/[.!?;。！？]$/.test(text)) return false;
        return text.split(/\s+/).length <= 6;
      };
      const validItems = items.filter(item => {
        if (!item || !item.targetText) return false;
        if (!looksLikeWordOrPhrase(item.targetText)) return false;
        return Boolean(String(item.translation || '').trim());
      });
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
        await cacheSet(cacheKeys.vocabulary(scenario.id, targetLanguage), combined, TTL.VOCABULARY);
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
  /** The signed-in learner's real profile name (may be empty for guest-style accounts). */
  learnerName: string;
  /** The learner's country display name, or null when unset/unknown. */
  learnerCountry: string | null;
  /**
   * The difficulty the character should actually play at — the scenario's
   * authored tier adjusted by the learner's recent measured performance.
   * See lib/roleplay/proficiency.ts.
   */
  effectiveDifficulty: string;
}

/**
 * Loads every piece of data a turn needs (scenario, situation, goals,
 * completions, history, vocab) from the DB, applying the shared cache
 * and the icebreaker vocab cap. Used by both the streaming route and the
 * standalone analyze endpoint so the two never drift apart.
 */
export async function loadSessionTurnData(session: SessionRow): Promise<SessionTurnData> {
  const { scenarioId } = session;
  const targetLanguage = session.targetLanguage ?? 'ja';
  const nativeLanguage = session.nativeLanguage ?? 'en';
  const currentPhase = session.phase as SessionPhase;

  // Everything below is keyed on ids already known from the session row
  // (scenarioId, situationId, userId) plus the two language codes, so none of
  // it has to wait on anything else. This used to run as six sequential waves
  // — scenario, then the core batch, then situation localizations, then goal
  // localizations, then vocabulary, then scenario/vocab localizations — and
  // every one of those round trips sat between the learner's utterance and
  // the model's first token.
  const [
    currentScenarioRow,
    conversationRows,
    goalsResult,
    completionsResult,
    rawSituationResult,
    learnerProfile,
    nativeSituationLoc,
    targetSituationLoc,
    goalLocs,
    nativeScenarioLoc,
    targetScenarioLoc,
    nativeVocabLoc,
    targetVocabLoc,
    proficiency,
    baseVocab,
  ] = await Promise.all([
    (async (): Promise<ScenarioRow | null> => {
      const k = cacheKeys.scenario(scenarioId);
      const c = await cacheGet<ScenarioRow | null>(k);
      if (c) return c;
      const r = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).then(r => r[0] ?? null);
      if (r) await cacheSet(k, r, TTL.SCENARIO);
      return r;
    })(),

    db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, session.id))
      // The user turn and the AI reply share a turnNo, so turnNo alone leaves
      // their order up to the planner. id breaks the tie in insert order,
      // which is user-then-AI.
      .orderBy(asc(conversations.turnNo), asc(conversations.id)),

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

    (async (): Promise<{ name: string; countryName: string | null }> => {
      const k = cacheKeys.userProfile(session.userId);
      const c = await cacheGet<{ name: string; countryName: string | null }>(k);
      if (c) return c;
      const [r] = await db
        .select({ name: users.name, countryName: countries.name })
        .from(users)
        .leftJoin(countries, eq(users.countryCode, countries.code))
        .where(eq(users.id, session.userId))
        .limit(1);
      const profile = { name: r?.name ?? '', countryName: r?.countryName ?? null };
      await cacheSet(k, profile, TTL.USER_PROFILE);
      return profile;
    })(),

    session.situationId && nativeLanguage !== 'en'
      ? getSituationLocalization(session.situationId, nativeLanguage)
      : Promise.resolve(null),

    session.situationId && targetLanguage
      ? getTargetSituationLocalization(session.situationId, targetLanguage)
      : Promise.resolve(null),

    targetLanguage
      ? getTargetGoalLocalizations(scenarioId, targetLanguage)
      : Promise.resolve(new Map<number, { goalText: string | null; targetPhrase: string | null }>()),

    nativeLanguage !== 'en' ? getScenarioLocalization(scenarioId, nativeLanguage) : Promise.resolve(null),

    targetLanguage ? getTargetScenarioLocalization(scenarioId, targetLanguage) : Promise.resolve(null),

    nativeLanguage !== 'en'
      ? getScenarioVocabLocalizations(scenarioId, nativeLanguage)
      : Promise.resolve(new Map<number, { translation: string | null; usageTip: string | null }>()),

    targetLanguage
      ? getTargetVocabLocalizations(scenarioId, targetLanguage)
      : Promise.resolve(new Map<number, { translation: string | null; usageTip: string | null }>()),

    getLearnerProficiency(session.userId, targetLanguage),

    // Vocabulary is only consulted in the phases that actually teach words.
    currentPhase === 'orientation' || currentPhase === 'icebreaker' || currentPhase === 'guided'
      ? (async (): Promise<{ rows: typeof vocabulary.$inferSelect[]; fromCache: boolean }> => {
          const k = cacheKeys.vocabulary(scenarioId, targetLanguage);
          const c = await cacheGet<typeof vocabulary.$inferSelect[]>(k);
          // Only a full list short-circuits: a cached partial list still needs
          // the DB read, since words may have been generated since it was set.
          if (c && c.length >= MAX_ICEBREAKER_VOCAB) return { rows: c, fromCache: true };
          // The canonical vocabulary rows are the Japanese seed ones ('ja'); a
          // target-language session sees those plus any rows already generated
          // for its own language. Other languages' generated rows are excluded so
          // a French session's AI-generated words never leak into a Japanese one.
          const languages = targetLanguage === 'ja' ? ['ja'] : ['ja', targetLanguage];
          const rows = await db.select().from(vocabulary)
            .where(and(eq(vocabulary.scenarioId, scenarioId), inArray(vocabulary.languageCode, languages)))
            .orderBy(vocabulary.id);
          return { rows, fromCache: false };
        })()
      : Promise.resolve({ rows: [], fromCache: true }),
  ]);

  let currentScenario = currentScenarioRow;
  const completedSequenceOrders = completionsResult.map(c => c.seqOrder);

  const currentTurnNo = conversationRows.length > 0
    ? Math.max(...conversationRows.map(c => c.turnNo)) + 1
    : 1;

  const conversationHistory = buildConversationHistory(conversationRows);

  const userTurnCount = conversationRows.filter(c => c.speaker === 'user').length;

  const behaviorMode = session.behaviorMode ?? 'standard';
  const isSameLanguage = targetLanguage === nativeLanguage;

  let situationResult = rawSituationResult;
  if (situationResult) {
    // Native-language localization first (instructional text a non-English
    // speaker can understand), then target-language last so the roleplay
    // content the learner actually practices wins.
    if (nativeSituationLoc) situationResult = applySituationLocalization(situationResult, nativeSituationLoc);
    if (targetSituationLoc) situationResult = applySituationLocalization(situationResult, targetSituationLoc);
    if (!targetSituationLoc && targetLanguage && targetLanguage !== 'ja') {
      console.warn(
        `[LOCALIZATION] Situation ${situationResult.id} has no ${targetLanguage} localization — the ` +
          `scenario setting may fall back to the Japan-shaped base text. Run: npm run db:backfill-target-localizations -- --lang=${targetLanguage}`,
      );
    }
  }

  let goals = goalsResult;
  if (goals.length > 0 && targetLanguage) {
    if (goalLocs.size > 0) {
      goals = goals.map((g) => {
        const loc = goalLocs.get(g.id);
        return loc ? applyGoalLocalization(g, loc) : g;
      });
    }
    const missing = goals.filter((g) => !goalLocs.has(g.id)).length;
    if (missing > 0 && targetLanguage !== 'ja') {
      console.warn(
        `[LOCALIZATION] Scenario ${scenarioId} has ${missing} goal(s) without ${targetLanguage} ` +
          `localization — targetPhrase may fall back to Japanese. Run: npm run db:backfill-target-localizations -- --lang=${targetLanguage} --only=goals`,
      );
    }
  }

  let vocabRows = baseVocab.rows;

  // Topping up a thin vocabulary list costs a full LLM round trip. That used
  // to happen inline on whatever turn first noticed the shortfall, adding
  // seconds of silence mid-conversation.
  //
  // Orientation is the one turn where waiting is right: it is the first turn
  // of the session, the icebreaker that immediately follows needs the words,
  // and there is no prior context to lose. On every later turn we teach with
  // what exists and generate in the background so the next session is whole.
  if (vocabRows.length < MAX_ICEBREAKER_VOCAB && currentScenario) {
    if (currentPhase === 'orientation') {
      vocabRows = await generateAndPersistMissingVocabulary(
        currentScenario, vocabRows, targetLanguage, nativeLanguage,
      );
    } else if (currentPhase === 'icebreaker' || currentPhase === 'guided') {
      const scenarioForBackfill = currentScenario;
      const topUpKey = `${scenarioId}:${targetLanguage}`;
      if (!vocabTopUpInFlight.has(topUpKey)) {
        vocabTopUpInFlight.add(topUpKey);
        void generateAndPersistMissingVocabulary(
          scenarioForBackfill, vocabRows, targetLanguage, nativeLanguage,
        ).catch((err) => {
          console.warn('[VOCABULARY] background top-up failed:', err);
        }).finally(() => {
          vocabTopUpInFlight.delete(topUpKey);
        });
      }
    }
  }

  // Refresh the cache only when this call actually read from the database;
  // rewriting a value we just read back from the cache is pure overhead.
  if (!baseVocab.fromCache && vocabRows.length > 0) {
    await cacheSet(cacheKeys.vocabulary(scenarioId, targetLanguage), vocabRows, TTL.VOCABULARY);
  }

  if ((currentPhase === 'icebreaker' || currentPhase === 'orientation') && vocabRows.length > MAX_ICEBREAKER_VOCAB) {
    vocabRows = vocabRows.slice(0, MAX_ICEBREAKER_VOCAB);
  }

  let scenarioLocalized = false;

  if (currentScenario) {
    // Native-language scenario localization (the base scenario fields are
    // English) so a learner who doesn't speak English still gets a scenario
    // they can understand.
    if (nativeScenarioLoc) {
      currentScenario = applyScenarioLocalization(currentScenario, nativeScenarioLoc);
      scenarioLocalized = true;
    }

    // Target-language scenario localization (e.g. French context and
    // character names for a French course). Applied last so the roleplay
    // content matches the language the student is actually learning.
    if (targetScenarioLoc) {
      currentScenario = applyScenarioLocalization(currentScenario, targetScenarioLoc);
      scenarioLocalized = true;
    }

    // Applied last so the avatar the learner picked for this session names
    // the character in prompts and the greeting, ahead of both the shared
    // scenario row and any localized character name.
    currentScenario = applySessionAvatarIdentity(currentScenario, session.selectedAvatarId);
  }

  if (currentScenario && vocabRows.length > 0) {
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
    learnerName: learnerProfile.name,
    learnerCountry: learnerProfile.countryName,
    effectiveDifficulty: resolveDifficulty(currentScenario?.difficulty, proficiency),
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

  return analyzeUserTurn({
    userInput,
    aiReplyText: aiReplyText ?? '',
    currentTurnNo: data.currentTurnNo,
    // Grade against the tier the character actually played at, not the one
    // the scenario was authored for — otherwise a learner who has been
    // promoted is marked down for the harder conversation they were given.
    scenario: { ...scenario, difficulty: data.effectiveDifficulty },
    goals: data.goals,
    completedGoalSequenceOrders: data.completedSequenceOrders,
    conversationHistory: data.conversationHistory,
    behaviorMode: data.behaviorMode,
    situationContext,
    situationLearningGoals,
    targetLanguage: data.targetLanguage,
    nativeLanguage: data.nativeLanguage,
    learnerName: data.learnerName,
    learnerCountry: data.learnerCountry,
    // The reply being graded was generated by the prompt for THIS phase, so
    // the analyzer must be told which output contract to expect.
    phase: data.currentPhase,
    isSameLanguage: data.isSameLanguage,
  });
}
