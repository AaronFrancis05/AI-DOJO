/**
 * Languages whose writing system does not separate words with spaces (CJK,
 * Thai, Khmer, Burmese, Lao). For these there is no word boundary to enforce,
 * so phrase matching falls back to raw substring containment.
 */
const SPACE_DELIMITED_LANGUAGES = new Set([
  'en', 'fr', 'de', 'es', 'ru', 'ar', 'sw', 'lg', 'pt', 'it', 'nl', 'tr', 'pl',
  'uk', 'el', 'he', 'fa', 'hi', 'bn', 'ur', 'ko', 'vi', 'tl', 'ms', 'id',
]);

/**
 * Lightweight lexical check for whether the learner's raw input contains the
 * word currently being drilled (its target text, romaji phonetic, or meaning).
 * Used to steer the model past a word the learner has already produced, so the
 * AI doesn't loop back and ask them to repeat it.
 *
 * Matching rules:
 * - Exact match always counts.
 * - For space-delimited languages, a phrase match must appear as a standalone
 *   token, so a partial input like "bon" never matches "bonjour" (and the user
 *   typing "bonjour" never counts as producing the word "bon").
 * - Non-space-delimited scripts fall back to substring containment; reverse
 *   containment is never used.
 */
export function userAttemptsVocabWord(
  input: string,
  v: { targetText: string; phonetic: string | null; translation: string },
  targetLanguage: string,
): boolean {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[.,!?;:'"()\[\]⟦⟧【】]/g, '');
  const clean = norm(input);
  if (!clean) return false;
  const haystacks = [v.targetText, v.phonetic ?? '', v.translation].map(norm).filter(Boolean);

  if (!SPACE_DELIMITED_LANGUAGES.has(targetLanguage)) {
    return haystacks.some(h => clean === h || clean.includes(h));
  }

  return haystacks.some(h => {
    if (clean === h) return true;
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(clean);
  });
}
