/**
 * A tutor's two language sets, and the one place they are parsed and validated.
 *
 * `tutors.languages` is what they **teach** — the target language a learner is
 * practising. `tutors.instruction_languages` is what they **explain in** — the
 * native language the coaching, the debrief and the room chat are written in.
 * They are different capabilities and a tutor may hold several of each: someone
 * who speaks five languages can teach any of them in any of the others.
 *
 * Both are stored comma-separated on the row, which is the shape `languages`
 * already had — denormalised because they are read on every listing and never
 * queried independently.
 */
import { loadLanguageCatalog } from '@/lib/language-registry';

/** Accepts either the stored comma-separated string or a JSON array of codes. */
export function parseLanguageCodes(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return [...new Set(
    raw
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim())
      .filter(Boolean),
  )];
}

export function serializeLanguageCodes(codes: string[]): string {
  return codes.join(',');
}

/**
 * The codes a tutor may pick from when scheduling.
 *
 * `explainsIn` falls back to `teaches` for a profile written before
 * instruction languages existed and somehow missed the backfill — an empty
 * "Explained in" list would block a tutor from scheduling at all, which is a
 * worse failure than offering them the languages they already teach.
 */
export function tutorLanguageSets(tutor: {
  languages: string | null;
  instructionLanguages: string | null;
}): { teaches: string[]; explainsIn: string[] } {
  const teaches = parseLanguageCodes(tutor.languages);
  const explainsIn = parseLanguageCodes(tutor.instructionLanguages);
  return { teaches, explainsIn: explainsIn.length > 0 ? explainsIn : teaches };
}

/**
 * Whether this tutor may schedule in this language pair.
 *
 * Returns a message to send back as a 400, or null when the pair is fine.
 * Shared by every scheduling route so a class, an assessment and a booking
 * cannot disagree about what a tutor is allowed to run — before this existed,
 * `targetLanguage` was only checked for being non-empty, so a tutor could
 * schedule a Japanese class without teaching Japanese.
 *
 * `instructionLanguage` is optional: null means the pre-existing behaviour of
 * each learner reading in their own native language.
 */
export function tutorLanguageError(
  tutor: { languages: string | null; instructionLanguages: string | null },
  targetLanguage: string,
  instructionLanguage: string | null,
): string | null {
  const { teaches, explainsIn } = tutorLanguageSets(tutor);

  if (!teaches.includes(targetLanguage)) {
    return `You are not listed as teaching ${targetLanguage}. Add it to your profile first.`;
  }
  if (instructionLanguage && !explainsIn.includes(instructionLanguage)) {
    return `You are not listed as explaining in ${instructionLanguage}. Add it to your profile first.`;
  }
  return null;
}

/**
 * Which of `codes` are not offered on that side of the configured catalogue.
 * Empty means every code is valid.
 */
export async function unknownLanguageCodes(
  codes: string[],
  side: 'target' | 'native',
): Promise<string[]> {
  const catalog = await loadLanguageCatalog();
  const known = new Set<string>(
    (side === 'target' ? catalog.target : catalog.native).map((l) => l.code),
  );
  return codes.filter((c) => !known.has(c));
}
