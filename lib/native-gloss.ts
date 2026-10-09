/**
 * The pure half of native-language vocabulary localization, kept apart from
 * lib/localization.ts (which imports the database client) so it can be unit
 * tested without a DATABASE_URL. Import it through lib/localization.ts.
 */

export interface GlossSource {
  /** The base row's own word, in `languageCode`. */
  targetText: string;
  /** The base row's meaning — English for the seeded catalogue. */
  translation: string;
  languageCode: string;
}

/**
 * The meaning of a vocabulary item in the learner's native language, from
 * data that already exists. "The word in language X" IS its meaning for a
 * speaker of X, so no generation is needed for any language that has target
 * localizations:
 *
 * - native is English → the base `translation` (the seeded rows' English
 *   meaning, or an English-authored row's plain-English definition);
 * - native is the row's own language → the base word (for the seeded rows a
 *   Japanese speaker's meaning is the Japanese word itself);
 * - otherwise → vocabulary_localizations[native].translation.
 *
 * Returns null when none applies; the caller keeps the English meaning.
 */
export function resolveNativeGloss(
  base: GlossSource,
  nativeLanguage: string,
  nativeLoc: { translation: string | null } | undefined,
): string | null {
  if (nativeLanguage === 'en') return base.translation;
  if (nativeLanguage === base.languageCode) return base.targetText;
  return nativeLoc?.translation ?? null;
}
