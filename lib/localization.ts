import { db } from '../src/db';
import { scenarioLocalizations, vocabulary, vocabularyLocalizations } from '../src/schema';
import { and, eq } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheKeys, TTL } from './cache';

export const DEFAULT_NATIVE_LANGUAGE = 'en';

export type ScenarioLocalizationRow = typeof scenarioLocalizations.$inferSelect;

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
 * Loads the localized translation/usageTip for every vocabulary item of a
 * scenario in the given language. Returns a map keyed by vocabularyId with
 * only the localized fields (falls back to the base value at the call site).
 * Cached for 1hr.
 */
export async function getScenarioVocabLocalizations(
  scenarioId: number,
  languageCode: string,
): Promise<Map<number, VocabLocalizationFields>> {
  const map = new Map<number, VocabLocalizationFields>();
  if (!languageCode || languageCode === DEFAULT_NATIVE_LANGUAGE) return map;

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
