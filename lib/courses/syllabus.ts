/**
 * The structured teaching syllabus (PLAN.md 4.7), as pure functions.
 *
 * The syllabus lives in the existing course tables — courses → course_levels
 * (with a CEFR band) → units (with can-do statements) → lessons →
 * lesson_phases. This module holds what those rows do not: the standard tutor
 * lesson template, how its minutes split between the syllabus and the
 * learner's personal fixes, and the can-do bookkeeping.
 *
 * Client-safe: the progress map and the lesson-plan editor import it.
 */

import { compareCefr, isCefrLevel, type CefrLevel } from '@/lib/interview/cefr';

/** The self-study strands plus the one that was missing before 4.7. */
export const READING_WRITING_PHASE = 'reading_writing';

/** One phase of the standard 1:1 tutor lesson. */
export interface TemplatePhase {
  key: TutorPhaseKey;
  title: string;
  objective: string;
  /** Part of the SYLLABUS share, or the personal-fix slot. */
  kind: 'syllabus' | 'fix';
  /** Weight within its kind. */
  weight: number;
}

export const TUTOR_PHASE_KEYS = [
  'warm_up',
  'present',
  'controlled',
  'free_practice',
  'fix_slot',
  'wrap_up',
] as const;
export type TutorPhaseKey = (typeof TUTOR_PHASE_KEYS)[number];

/**
 * The standard lesson. Seeded as `lesson_phases` rows on every tutor lesson of
 * the English course, and the skeleton every AI-drafted plan fills.
 */
export const TUTOR_LESSON_TEMPLATE: TemplatePhase[] = [
  { key: 'warm_up', title: 'Warm-up', objective: 'Review the last lesson and the homework study pack.', kind: 'syllabus', weight: 1 },
  { key: 'present', title: 'Present the new point', objective: 'Introduce the unit\'s new language with examples, in simple English.', kind: 'syllabus', weight: 2 },
  { key: 'controlled', title: 'Controlled practice', objective: 'Short, accurate drills on the new point.', kind: 'syllabus', weight: 2 },
  { key: 'free_practice', title: 'Free practice', objective: 'A role-play from the unit, using the new point freely.', kind: 'syllabus', weight: 2.5 },
  { key: 'fix_slot', title: 'Personal fix slot', objective: 'Targeted work on this learner\'s own recurring mistakes, from the briefing.', kind: 'fix', weight: 1 },
  { key: 'wrap_up', title: 'Wrap-up and homework', objective: 'Recap, check the can-do statements, and set the homework.', kind: 'syllabus', weight: 0.5 },
];

/**
 * The share of the lesson given to the personal-fix slot. About a quarter by
 * default; beginners need more syllabus, and advanced learners (often exam
 * candidates) get more targeted work.
 */
export function fixShareFor(level: CefrLevel | null): number {
  if (!level) return 0.25;
  if (compareCefr(level, 'A1') <= 0) return 0.15;
  if (compareCefr(level, 'C1') >= 0) return 0.35;
  return 0.25;
}

export interface PhaseTiming {
  key: TutorPhaseKey;
  title: string;
  minutes: number;
}

/**
 * Minutes per phase for a lesson of `durationMinutes`. Whole minutes that sum
 * exactly to the duration, with any rounding remainder given to free
 * practice, which is the phase that stretches most naturally.
 */
export function lessonTimings(durationMinutes: number, fixShare: number): PhaseTiming[] {
  const share = Math.min(0.6, Math.max(0, fixShare));
  const fixMinutes = durationMinutes * share;
  const syllabusMinutes = durationMinutes - fixMinutes;
  const syllabusWeight = TUTOR_LESSON_TEMPLATE
    .filter((p) => p.kind === 'syllabus')
    .reduce((sum, p) => sum + p.weight, 0);

  const timings = TUTOR_LESSON_TEMPLATE.map((p) => ({
    key: p.key,
    title: p.title,
    minutes: Math.max(
      1,
      Math.round(p.kind === 'fix' ? fixMinutes : (syllabusMinutes * p.weight) / syllabusWeight),
    ),
  }));

  const drift = durationMinutes - timings.reduce((sum, t) => sum + t.minutes, 0);
  const free = timings.find((t) => t.key === 'free_practice');
  if (free) free.minutes = Math.max(1, free.minutes + drift);
  return timings;
}

/* ── Can-do statements ─────────────────────────────────────────────── */

export const CAN_DO_STATUSES = ['introduced', 'practised', 'achieved'] as const;
export type CanDoStatus = (typeof CAN_DO_STATUSES)[number];

export function isCanDoStatus(value: unknown): value is CanDoStatus {
  return typeof value === 'string' && (CAN_DO_STATUSES as readonly string[]).includes(value);
}

/** `units.can_do` is a JSON array of strings; anything else reads as none. */
export function parseCanDo(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
  } catch {
    return [];
  }
}

/** A unit counts as completed when every one of its can-do statements is achieved. */
export function isUnitAchieved(statementCount: number, statuses: (CanDoStatus | null)[]): boolean {
  if (statementCount === 0) return false;
  for (let i = 0; i < statementCount; i++) {
    if (statuses[i] !== 'achieved') return false;
  }
  return true;
}

/** The CEFR band of a course level, or null for an older XP-gated level. */
export function levelCefr(raw: string | null | undefined): CefrLevel | null {
  return isCefrLevel(raw) ? raw : null;
}
