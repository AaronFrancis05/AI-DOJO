import { db } from '../src/db';
import {
  scenarioGoalLocalizations,
  scenarioGoalNativeLocalizations,
  scenarioGoals,
  scenarioLocalizations,
  scenarioNativeLocalizations,
  situationLocalizations,
  situationNativeLocalizations,
  vocabulary,
  vocabularyLocalizations,
  vocabularyNativeNotes,
} from '../src/schema';
import { and, eq } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheKeys, TTL } from './cache';
import { BASE_CONTENT_LANGUAGE } from './language';
import { resolveNativeGloss } from './native-gloss';

export { resolveNativeGloss, type GlossSource } from './native-gloss';

export const DEFAULT_NATIVE_LANGUAGE = 'en';

export type ScenarioLocalizationRow = typeof scenarioLocalizations.$inferSelect;
export type SituationLocalizationRow = typeof situationLocalizations.$inferSelect;
export type ScenarioGoalLocalizationRow = typeof scenarioGoalLocalizations.$inferSelect;

export interface VocabLocalizationFields {
  translation: string | null;
  usageTip: string | null;
}

export interface ScenarioLocalizationFields {
  title: string | null;
  context: string | null;
  learningGoals: string | null;
  aiCharacterName: string | null;
  aiCharacterRole: string | null;
  userCharacterName: string | null;
  userCharacterRole: string | null;
}

export interface SituationLocalizationFields {
  title: string | null;
  context: string | null;
  learningGoals: string | null;
  focusPills: string | null;
}

async function queryScenarioLocalization(
  scenarioId: number,
  languageCode: string,
): Promise<ScenarioLocalizationRow | null> {
  const k = cacheKeys.scenarioLocalization(scenarioId, languageCode);
  const cached = await cacheGet<ScenarioLocalizationRow | null>(k);
  if (cached !== undefined && cached !== null) return cached;
  const [row] = await db
    .select()
    .from(scenarioLocalizations)
    .where(and(
      eq(scenarioLocalizations.scenarioId, scenarioId),
      eq(scenarioLocalizations.languageCode, languageCode),
    ))
    .limit(1);
  await cacheSet(k, row ?? null, TTL.SCENARIO);
  return row ?? null;
}

/**
 * Loads the curated localization row for a scenario in the given language,
 * or null when none exists (or the language is the base 'en').
 * Cached for 1hr — localization rows are content, not live state.
 */
export async function getScenarioLocalization(
  scenarioId: number,
  languageCode: string,
): Promise<ScenarioLocalizationRow | null> {
  if (!languageCode || languageCode === DEFAULT_NATIVE_LANGUAGE) return null;
  return queryScenarioLocalization(scenarioId, languageCode);
}

/**
 * Same as getScenarioLocalization but does NOT short-circuit on the base
 * 'en' language. Used to localize course/lesson content into the target
 * language (e.g. a French course seeding an 'en' entry is never needed, but
 * an English course needs its vocab localized away from the Japanese base).
 */
export async function getTargetScenarioLocalization(
  scenarioId: number,
  languageCode: string,
): Promise<ScenarioLocalizationRow | null> {
  if (!languageCode) return null;
  return queryScenarioLocalization(scenarioId, languageCode);
}

async function querySituationLocalization(
  situationId: number,
  languageCode: string,
): Promise<SituationLocalizationRow | null> {
  const k = cacheKeys.situationLocalization(situationId, languageCode);
  const cached = await cacheGet<SituationLocalizationRow | null>(k);
  if (cached !== undefined && cached !== null) return cached;
  const [row] = await db
    .select()
    .from(situationLocalizations)
    .where(and(
      eq(situationLocalizations.situationId, situationId),
      eq(situationLocalizations.languageCode, languageCode),
    ))
    .limit(1);
  await cacheSet(k, row ?? null, TTL.SITUATION);
  return row ?? null;
}

/**
 * Loads the curated localization row for a situation in the given language,
 * or null when none exists (or the language is the base 'en').
 */
export async function getSituationLocalization(
  situationId: number,
  languageCode: string,
): Promise<SituationLocalizationRow | null> {
  if (!languageCode || languageCode === DEFAULT_NATIVE_LANGUAGE) return null;
  return querySituationLocalization(situationId, languageCode);
}

/**
 * Same as getSituationLocalization but does NOT short-circuit on the base
 * 'en' language — used to localize the target-language roleplay content.
 */
export async function getTargetSituationLocalization(
  situationId: number,
  languageCode: string,
): Promise<SituationLocalizationRow | null> {
  if (!languageCode) return null;
  return querySituationLocalization(situationId, languageCode);
}

/** Merges localized situation fields over a base situation row, or returns the base row untouched when nothing is available. */
export function applySituationLocalization<T extends SituationLocalizationFields>(
  base: T,
  loc: SituationLocalizationFields | null,
): T {
  if (!loc) return base;
  return {
    ...base,
    title: loc.title ?? base.title,
    context: loc.context ?? base.context,
    learningGoals: loc.learningGoals ?? base.learningGoals,
    focusPills: loc.focusPills ?? base.focusPills,
  };
}

async function queryScenarioVocabLocalizations(
  scenarioId: number,
  languageCode: string,
): Promise<Map<number, VocabLocalizationFields>> {
  const map = new Map<number, VocabLocalizationFields>();

  const k = cacheKeys.vocabLocalizations(scenarioId, languageCode);
  const cached = await cacheGet<Array<{ vocabularyId: number; translation: string | null; usageTip: string | null }>>(k);
  let rows: Array<{ vocabularyId: number; translation: string | null; usageTip: string | null }>;
  if (cached && Array.isArray(cached)) {
    rows = cached;
  } else {
    rows = await db
      .select({
        vocabularyId: vocabularyLocalizations.vocabularyId,
        translation: vocabularyLocalizations.translation,
        usageTip: vocabularyLocalizations.usageTip,
      })
      .from(vocabularyLocalizations)
      .innerJoin(vocabulary, eq(vocabularyLocalizations.vocabularyId, vocabulary.id))
      .where(and(
        eq(vocabulary.scenarioId, scenarioId),
        eq(vocabularyLocalizations.languageCode, languageCode),
      ));
    await cacheSet(k, rows, TTL.VOCABULARY);
  }

  for (const row of rows) {
    map.set(row.vocabularyId, { translation: row.translation, usageTip: row.usageTip });
  }
  return map;
}

/**
 * Loads the localized translation/usageTip for every vocabulary item of a
 * scenario in the given language. Returns a map keyed by vocabularyId with
 * only the localized fields (falls back to the base value at the call site).
 * Cached for 1hr.
 */
export async function getScenarioVocabLocalizations(
  scenarioId: number,
  languageCode: string,
): Promise<Map<number, VocabLocalizationFields>> {
  if (!languageCode || languageCode === DEFAULT_NATIVE_LANGUAGE) return new Map();
  return queryScenarioVocabLocalizations(scenarioId, languageCode);
}

/**
 * Same as getScenarioVocabLocalizations but does NOT short-circuit on the
 * base 'en' language. The base vocabulary rows are Japanese, so an English
 * course still needs its targetText overridden to English words.
 */
export async function getTargetVocabLocalizations(
  scenarioId: number,
  languageCode: string,
): Promise<Map<number, VocabLocalizationFields>> {
  if (!languageCode) return new Map();
  return queryScenarioVocabLocalizations(scenarioId, languageCode);
}

/** Merges localized scenario fields over a base scenario row, or returns the base row untouched when nothing is available. */
export function applyScenarioLocalization<T extends ScenarioLocalizationFields>(
  base: T,
  loc: ScenarioLocalizationFields | null,
): T {
  if (!loc) return base;
  return {
    ...base,
    title: loc.title ?? base.title,
    context: loc.context ?? base.context,
    learningGoals: loc.learningGoals ?? base.learningGoals,
    aiCharacterName: loc.aiCharacterName ?? base.aiCharacterName,
    aiCharacterRole: loc.aiCharacterRole ?? base.aiCharacterRole,
    userCharacterName: loc.userCharacterName ?? base.userCharacterName,
    userCharacterRole: loc.userCharacterRole ?? base.userCharacterRole,
  };
}

/**
 * Overrides the TARGET-language text of each vocabulary row using the
 * localization map (vocabularyLocalizations.translation holds the word in
 * that language). The base translation (English) is preserved so learners
 * still see the meaning alongside the localized target word.
 */
export function applyTargetLanguageVocab<
  T extends { id: number; targetText: string; usageTip: string | null },
>(
  vocabRows: T[],
  locMap: Map<number, VocabLocalizationFields>,
): T[] {
  return vocabRows.map((v) => {
    const loc = locMap.get(v.id);
    if (!loc || !loc.translation) return v;
    return {
      ...v,
      targetText: loc.translation,
      usageTip: loc.usageTip ?? v.usageTip,
    };
  });
}

export interface GoalLocalizationFields {
  goalText: string | null;
  targetPhrase: string | null;
}

async function queryScenarioGoalLocalizations(
  scenarioId: number,
  languageCode: string,
): Promise<Map<number, GoalLocalizationFields>> {
  const map = new Map<number, GoalLocalizationFields>();

  const k = cacheKeys.goalLocalizations(scenarioId, languageCode);
  const cached = await cacheGet<Array<{ scenarioGoalId: number; goalText: string | null; targetPhrase: string | null }>>(k);
  let rows: Array<{ scenarioGoalId: number; goalText: string | null; targetPhrase: string | null }>;
  if (cached && Array.isArray(cached)) {
    rows = cached;
  } else {
    rows = await db
      .select({
        scenarioGoalId: scenarioGoalLocalizations.scenarioGoalId,
        goalText: scenarioGoalLocalizations.goalText,
        targetPhrase: scenarioGoalLocalizations.targetPhrase,
      })
      .from(scenarioGoalLocalizations)
      .innerJoin(scenarioGoals, eq(scenarioGoalLocalizations.scenarioGoalId, scenarioGoals.id))
      .where(and(
        eq(scenarioGoals.scenarioId, scenarioId),
        eq(scenarioGoalLocalizations.languageCode, languageCode),
      ));
    await cacheSet(k, rows, TTL.GOALS);
  }

  for (const row of rows) {
    map.set(row.scenarioGoalId, { goalText: row.goalText, targetPhrase: row.targetPhrase });
  }
  return map;
}

/**
 * Loads the localized goalText/targetPhrase for every goal of a scenario in
 * the given language. Returns a map keyed by scenarioGoalId with only the
 * localized fields (falls back to the base value at the call site).
 */
export async function getTargetGoalLocalizations(
  scenarioId: number,
  languageCode: string,
): Promise<Map<number, GoalLocalizationFields>> {
  if (!languageCode) return new Map();
  return queryScenarioGoalLocalizations(scenarioId, languageCode);
}

/** Merges localized goal fields over a base goal row, or returns the base row untouched when nothing is available. */
export function applyGoalLocalization<
  T extends { id: number; goalText: string; targetPhrase: string | null },
>(
  base: T,
  loc: GoalLocalizationFields | null,
): T {
  if (!loc) return base;
  return {
    ...base,
    goalText: loc.goalText ?? base.goalText,
    targetPhrase: loc.targetPhrase ?? base.targetPhrase,
  };
}

// ── Native-language explanations (keyed by target AND native) ──────────────
//
// Everything above is keyed by one language and holds TARGET content. What a
// learner reads to understand the lesson depends on the pair: the English café
// scene explained in French is a different text from the French café scene.
// The resolvers below read the (target, native) tables first, then fall back
// native → English → base, warning once per missing pair so a gap is visible
// in the logs instead of silently showing a mixed-language screen.

const ENGLISH = 'en';
const warnedMissing = new Set<string>();

function warnMissingNative(kind: string, id: number, targetLanguage: string, nativeLanguage: string): void {
  const k = `${kind}:${id}:${targetLanguage}:${nativeLanguage}`;
  if (warnedMissing.has(k)) return;
  warnedMissing.add(k);
  console.warn(
    `[LOCALIZATION] ${kind} ${id} has no ${nativeLanguage} explanation for ${targetLanguage} learners — ` +
      `falling back to English. Run: npm run db:backfill-target-localizations -- --only=native --target=${targetLanguage} --lang=${nativeLanguage}`,
  );
}

type ScenarioNativeRow = typeof scenarioNativeLocalizations.$inferSelect;
type SituationNativeRow = typeof situationNativeLocalizations.$inferSelect;

async function queryScenarioNative(
  scenarioId: number,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<ScenarioNativeRow | null> {
  const k = cacheKeys.scenarioNativeLocalization(scenarioId, targetLanguage, nativeLanguage);
  const cached = await cacheGet<ScenarioNativeRow | null>(k);
  if (cached !== undefined && cached !== null) return cached;
  const [row] = await db
    .select()
    .from(scenarioNativeLocalizations)
    .where(and(
      eq(scenarioNativeLocalizations.scenarioId, scenarioId),
      eq(scenarioNativeLocalizations.targetLanguage, targetLanguage),
      eq(scenarioNativeLocalizations.nativeLanguage, nativeLanguage),
    ))
    .limit(1);
  await cacheSet(k, row ?? null, TTL.SCENARIO);
  return row ?? null;
}

async function querySituationNative(
  situationId: number,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<SituationNativeRow | null> {
  const k = cacheKeys.situationNativeLocalization(situationId, targetLanguage, nativeLanguage);
  const cached = await cacheGet<SituationNativeRow | null>(k);
  if (cached !== undefined && cached !== null) return cached;
  const [row] = await db
    .select()
    .from(situationNativeLocalizations)
    .where(and(
      eq(situationNativeLocalizations.situationId, situationId),
      eq(situationNativeLocalizations.targetLanguage, targetLanguage),
      eq(situationNativeLocalizations.nativeLanguage, nativeLanguage),
    ))
    .limit(1);
  await cacheSet(k, row ?? null, TTL.SITUATION);
  return row ?? null;
}

function scenarioNativeFields(row: ScenarioNativeRow): ScenarioLocalizationFields {
  // Character names are deliberately null: they belong to the target scene,
  // so applyScenarioLocalization keeps whatever the target layer set.
  return {
    title: row.title,
    context: row.context,
    learningGoals: row.learningGoals,
    aiCharacterName: null,
    aiCharacterRole: row.aiCharacterRole,
    userCharacterName: null,
    userCharacterRole: row.userCharacterRole,
  };
}

/**
 * The text a learner reads to understand a scenario: the target scene,
 * explained in their native language.
 *
 * Returns fields to merge with applyScenarioLocalization over the TARGET
 * scene (base row + getTargetScenarioLocalization), or null to show that
 * scene as-is. Order: the (target, native) row → for the base content
 * language, the legacy single-key row (those were literal translations of
 * the base scene, so they are correct there) → the English explanation →
 * null (the scene's own text).
 */
export async function resolveNativeScenarioLocalization(
  scenarioId: number,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<ScenarioLocalizationFields | null> {
  if (!nativeLanguage || nativeLanguage === targetLanguage) return null;
  const pair = await queryScenarioNative(scenarioId, targetLanguage, nativeLanguage);
  if (pair) return scenarioNativeFields(pair);

  if (targetLanguage === BASE_CONTENT_LANGUAGE) {
    // Base rows are English text; nothing to do for English speakers.
    if (nativeLanguage === ENGLISH) return null;
    const legacy = await getScenarioLocalization(scenarioId, nativeLanguage);
    if (legacy) return legacy;
    warnMissingNative('Scenario', scenarioId, targetLanguage, nativeLanguage);
    return null;
  }

  if (nativeLanguage !== ENGLISH) warnMissingNative('Scenario', scenarioId, targetLanguage, nativeLanguage);
  // An English learner's target scene is already English — show it as-is.
  if (targetLanguage === ENGLISH) return null;
  const english = await queryScenarioNative(scenarioId, targetLanguage, ENGLISH);
  return english ? scenarioNativeFields(english) : null;
}

/** Situation counterpart of resolveNativeScenarioLocalization — merge with applySituationLocalization. */
export async function resolveNativeSituationLocalization(
  situationId: number,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<SituationLocalizationFields | null> {
  if (!nativeLanguage || nativeLanguage === targetLanguage) return null;
  const pair = await querySituationNative(situationId, targetLanguage, nativeLanguage);
  if (pair) return pair;

  if (targetLanguage === BASE_CONTENT_LANGUAGE) {
    if (nativeLanguage === ENGLISH) return null;
    const legacy = await getSituationLocalization(situationId, nativeLanguage);
    if (legacy) return legacy;
    warnMissingNative('Situation', situationId, targetLanguage, nativeLanguage);
    return null;
  }

  if (nativeLanguage !== ENGLISH) warnMissingNative('Situation', situationId, targetLanguage, nativeLanguage);
  if (targetLanguage === ENGLISH) return null;
  return querySituationNative(situationId, targetLanguage, ENGLISH);
}

async function queryGoalNative(
  scenarioId: number,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<Map<number, string>> {
  const k = cacheKeys.goalNativeLocalizations(scenarioId, targetLanguage, nativeLanguage);
  let rows = await cacheGet<Array<{ scenarioGoalId: number; goalText: string | null }>>(k);
  if (!rows || !Array.isArray(rows)) {
    rows = await db
      .select({
        scenarioGoalId: scenarioGoalNativeLocalizations.scenarioGoalId,
        goalText: scenarioGoalNativeLocalizations.goalText,
      })
      .from(scenarioGoalNativeLocalizations)
      .innerJoin(scenarioGoals, eq(scenarioGoalNativeLocalizations.scenarioGoalId, scenarioGoals.id))
      .where(and(
        eq(scenarioGoals.scenarioId, scenarioId),
        eq(scenarioGoalNativeLocalizations.targetLanguage, targetLanguage),
        eq(scenarioGoalNativeLocalizations.nativeLanguage, nativeLanguage),
      ));
    await cacheSet(k, rows, TTL.GOALS);
  }
  const map = new Map<number, string>();
  for (const r of rows) if (r.goalText) map.set(r.scenarioGoalId, r.goalText);
  return map;
}

/**
 * Goal descriptions in the learner's native language. targetPhrase is never
 * touched: it is what the learner says, so it stays in the target language.
 */
export async function localizeGoalsForLearner<
  T extends { id: number; goalText: string; targetPhrase: string | null },
>(
  scenarioId: number,
  goals: T[],
  targetLanguage: string,
  nativeLanguage: string,
): Promise<T[]> {
  if (goals.length === 0 || !nativeLanguage || nativeLanguage === targetLanguage) return goals;
  let texts = await queryGoalNative(scenarioId, targetLanguage, nativeLanguage);
  if (texts.size < goals.length && nativeLanguage !== ENGLISH) {
    warnMissingNative('Goals of scenario', scenarioId, targetLanguage, nativeLanguage);
    if (texts.size === 0 && targetLanguage !== ENGLISH) {
      texts = await queryGoalNative(scenarioId, targetLanguage, ENGLISH);
    }
  }
  if (texts.size === 0) return goals;
  return goals.map((g) => {
    const goalText = texts.get(g.id);
    return goalText ? { ...g, goalText } : g;
  });
}

async function queryVocabNativeNotes(
  scenarioId: number,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<Map<number, string>> {
  const k = cacheKeys.vocabNativeNotes(scenarioId, targetLanguage, nativeLanguage);
  let rows = await cacheGet<Array<{ vocabularyId: number; usageTip: string | null }>>(k);
  if (!rows || !Array.isArray(rows)) {
    rows = await db
      .select({ vocabularyId: vocabularyNativeNotes.vocabularyId, usageTip: vocabularyNativeNotes.usageTip })
      .from(vocabularyNativeNotes)
      .innerJoin(vocabulary, eq(vocabularyNativeNotes.vocabularyId, vocabulary.id))
      .where(and(
        eq(vocabulary.scenarioId, scenarioId),
        eq(vocabularyNativeNotes.targetLanguage, targetLanguage),
        eq(vocabularyNativeNotes.nativeLanguage, nativeLanguage),
      ));
    await cacheSet(k, rows, TTL.VOCABULARY);
  }
  const map = new Map<number, string>();
  for (const r of rows) if (r.usageTip) map.set(r.vocabularyId, r.usageTip);
  return map;
}

/**
 * The one place vocabulary rows become what a learner of `targetLanguage`
 * who speaks `nativeLanguage` sees:
 *
 * - targetText → the word in the target language (the target localization;
 *   for an English target with no curated row, the base English meaning);
 * - translation → its meaning in the native language (resolveNativeGloss);
 * - usageTip → the (target, native) note, else the target row's tip, else
 *   the base tip. A native-language note is never replaced by an English one.
 *
 * Rows authored directly in the target language (languageCode === target,
 * e.g. the English-first scenarios) keep their own word; their meaning and
 * tip are still resolved for the learner's language.
 */
export async function localizeVocabularyForLearner<
  T extends { id: number; targetText: string; translation: string; usageTip: string | null; languageCode: string },
>(
  scenarioId: number,
  rows: T[],
  targetLanguage: string,
  nativeLanguage: string,
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const needsNativeLoc = nativeLanguage !== ENGLISH && nativeLanguage !== BASE_CONTENT_LANGUAGE;
  const [targetLoc, nativeLoc, notes] = await Promise.all([
    targetLanguage && targetLanguage !== BASE_CONTENT_LANGUAGE
      ? getTargetVocabLocalizations(scenarioId, targetLanguage)
      : Promise.resolve(new Map<number, VocabLocalizationFields>()),
    needsNativeLoc
      ? getTargetVocabLocalizations(scenarioId, nativeLanguage)
      : Promise.resolve(new Map<number, VocabLocalizationFields>()),
    nativeLanguage && nativeLanguage !== targetLanguage
      ? queryVocabNativeNotes(scenarioId, targetLanguage, nativeLanguage)
      : Promise.resolve(new Map<number, string>()),
  ]);

  let missing = false;
  const out = rows.map((v) => {
    const authoredInTarget = v.languageCode === targetLanguage;
    const t = authoredInTarget ? undefined : targetLoc.get(v.id);
    const targetText = authoredInTarget
      ? v.targetText
      : t?.translation ?? (targetLanguage === ENGLISH ? v.translation : v.targetText);
    const gloss = resolveNativeGloss(v, nativeLanguage, nativeLoc.get(v.id));
    const note = notes.get(v.id);
    if (gloss == null || (!note && nativeLanguage !== ENGLISH && nativeLanguage !== targetLanguage)) missing = true;
    return {
      ...v,
      targetText,
      translation: gloss ?? v.translation,
      usageTip: note ?? t?.usageTip ?? v.usageTip,
    };
  });
  if (missing) warnMissingNative('Vocabulary of scenario', scenarioId, targetLanguage, nativeLanguage);
  return out;
}
