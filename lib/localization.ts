import { db } from '../src/db';
import { scenarioGoalLocalizations, scenarioGoals, scenarioLocalizations, situationLocalizations, vocabulary, vocabularyLocalizations } from '../src/schema';
import { and, eq } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheKeys, TTL } from './cache';

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
  loc: SituationLocalizationRow | null,
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
  loc: ScenarioLocalizationRow | null,
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
