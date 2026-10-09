/**
 * A tutor's post-lesson notes (PLAN.md 4.2): free-text notes plus a short list
 * of corrections they made, stored on the booking. Filing them is what turns
 * the human lesson into AI homework.
 *
 * Pure: the console's form and the Inngest job both validate through here.
 */

export interface LessonCorrection {
  /** target: what the learner said. */
  original: string;
  /** target: the corrected version. */
  corrected: string;
  /** Why, in a few words (any language the tutor writes in). */
  note: string;
}

export const MAX_LESSON_NOTES_CHARS = 4000;
export const MAX_LESSON_CORRECTIONS = 15;
const MAX_FIELD_CHARS = 400;

function field(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_CHARS) : '';
}

/**
 * Keeps only usable corrections: both sentences present and actually
 * different. Accepts the parsed JSON or the stored text.
 */
export function normalizeLessonCorrections(raw: unknown): LessonCorrection[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: LessonCorrection[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const original = field(c.original);
    const corrected = field(c.corrected);
    if (!original || !corrected || original === corrected) continue;
    out.push({ original, corrected, note: field(c.note) });
    if (out.length >= MAX_LESSON_CORRECTIONS) break;
  }
  return out;
}

/** `tutor_bookings.lesson_corrections` back into a list; anything malformed reads as none. */
export function parseLessonCorrections(stored: string | null | undefined): LessonCorrection[] {
  if (!stored) return [];
  try {
    return normalizeLessonCorrections(JSON.parse(stored));
  } catch {
    return [];
  }
}
