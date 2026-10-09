/**
 * Ranking tutors for a learner who may share no language with them
 * (PLAN.md 4.8 part 7). Pure.
 *
 * For a beginner (A0–A1, or not yet placed) a tutor who can explain in the
 * learner's own language goes first — many Ugandan tutors also speak Swahili,
 * French, Arabic or Kinyarwanda. Above A1 the order is left alone: teaching
 * through English is the method, and the shared language stops mattering.
 * Where no tutor matches, the lesson panel, captions and explanations carry
 * the lesson instead.
 */

import { compareCefr, type CefrLevel } from '@/lib/interview/cefr';

export function prefersSharedLanguage(level: CefrLevel | null): boolean {
  return level === null || compareCefr(level, 'A1') <= 0;
}

/** Stable: tutors that share the language keep their relative order, as do the rest. */
export function rankBySharedLanguage<T extends { instructionLanguages: string[] }>(
  tutors: T[],
  nativeLanguage: string,
  level: CefrLevel | null,
): (T & { sharesLanguage: boolean })[] {
  const marked = tutors.map((t) => ({ ...t, sharesLanguage: t.instructionLanguages.includes(nativeLanguage) }));
  if (!prefersSharedLanguage(level)) return marked;
  return [...marked.filter((t) => t.sharesLanguage), ...marked.filter((t) => !t.sharesLanguage)];
}

/**
 * Whether to warn before a 1:1 booking: an absolute beginner gets more from
 * the AI and the Classroom English starter unit first (PLAN.md 4.8 part 2).
 */
export function shouldWarnBeforeBooking(level: CefrLevel | null): boolean {
  return level === 'A0';
}
