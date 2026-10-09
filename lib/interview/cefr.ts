/**
 * CEFR levels for the placement interview and tutor vetting (PLAN.md 4.3, 4.6).
 *
 * The examiner and grader are the existing ones in this folder. This module
 * adds only what a CEFR verdict needs on top of the six 0-100 dimensions: the
 * rubric text the grader is given, parsing and validating its answer, the
 * thresholds a tutor applicant must clear, and the mapping back onto
 * `users.level` that the rest of the app reads.
 *
 * Pure and client-safe: the placement page imports the labels.
 */

import { SCORE_DIMENSIONS, type ScoreDimension, type TurnScores } from '@/lib/roleplay/score-dimensions';

/**
 * A0 is not a CEFR band; it stands for "pre-A1", a learner who cannot yet
 * hold the simplest exchange. It routes absolute beginners to the AI and the
 * Classroom English starter unit before a tutor (PLAN.md 4.8 part 2).
 */
export const CEFR_LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value);
}

/** Negative when a is below b. */
export function compareCefr(a: CefrLevel, b: CefrLevel): number {
  return CEFR_LEVELS.indexOf(a) - CEFR_LEVELS.indexOf(b);
}

export const CEFR_LABELS: Record<CefrLevel, string> = {
  A0: 'Starter',
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper intermediate',
  C1: 'Advanced',
  C2: 'Proficient',
};

/**
 * Descriptors condensed from the CEFR global scale and the spoken-production
 * scales. Given to the grader verbatim so the level it names is anchored to
 * the published scale rather than to its own sense of "good".
 */
const CEFR_DESCRIPTORS: Record<CefrLevel, string> = {
  A0: 'Cannot yet hold the simplest exchange; isolated words at most, or mostly another language.',
  A1: 'Can answer very simple personal questions with memorised words and phrases, slowly and with help.',
  A2: 'Can handle short routine exchanges on familiar topics (family, shopping, work) in simple sentences; frequent basic errors.',
  B1: 'Can keep a conversation going on familiar topics, describe experiences and give brief reasons; noticeable pauses and errors that rarely block meaning.',
  B2: 'Can interact with fluency and spontaneity, argue a viewpoint and handle unexpected turns; few errors that cause misunderstanding.',
  C1: 'Can express ideas fluently and precisely with little searching for words, use language flexibly for social and professional purposes, and structure complex answers clearly.',
  C2: 'Can express themselves spontaneously, very fluently and precisely, with fine shades of meaning, even on complex topics; errors are rare slips.',
};

export const CEFR_RUBRIC = `CEFR LEVEL. Also place the candidate on the CEFR scale, overall and per dimension, using these descriptors (A0 means "pre-A1"):
${CEFR_LEVELS.map((l) => `  - ${l}: ${CEFR_DESCRIPTORS[l]}`).join('\n')}
Place them at the HIGHEST level whose descriptor they consistently met in this interview, not the level of their best single sentence. Speech is judged on intelligibility, never on accent: a regional accent that is easy to follow does not lower any level.`;

export const CEFR_SCHEMA_LINE = `  "cefr": { "overall": "A0|A1|A2|B1|B2|C1|C2", "dimensions": { "vocabulary": "A0-C2", "grammar": "A0-C2", "fluency": "A0-C2", "cultural": "A0-C2", "task": "A0-C2", "expressionAppropriateness": "A0-C2" } },`;

export interface CefrVerdict {
  overall: CefrLevel;
  dimensions: Partial<Record<ScoreDimension, CefrLevel>>;
}

/**
 * The level a set of 0-100 scores implies, for when the grader returned
 * scores but no usable CEFR field. Coarse on purpose: it is a fallback, and a
 * fallback that guesses high would let an applicant through vetting.
 */
export function cefrFromScores(scores: TurnScores): CefrLevel {
  const mean = SCORE_DIMENSIONS.reduce((sum, d) => sum + scores[d], 0) / SCORE_DIMENSIONS.length;
  if (mean >= 92) return 'C2';
  if (mean >= 82) return 'C1';
  if (mean >= 70) return 'B2';
  if (mean >= 55) return 'B1';
  if (mean >= 40) return 'A2';
  if (mean >= 20) return 'A1';
  return 'A0';
}

/** Validates the grader's `cefr` field, falling back to the scores. */
export function parseCefrVerdict(raw: unknown, scores: TurnScores): CefrVerdict {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const overall = isCefrLevel(source.overall) ? source.overall : cefrFromScores(scores);
  const dims = (source.dimensions && typeof source.dimensions === 'object'
    ? source.dimensions
    : {}) as Record<string, unknown>;
  const dimensions: CefrVerdict['dimensions'] = {};
  for (const d of SCORE_DIMENSIONS) {
    if (isCefrLevel(dims[d])) dimensions[d] = dims[d];
  }
  return { overall, dimensions };
}

/** `users.level` (beginner / intermediate / advanced) for a CEFR level. */
export function proficiencyForCefr(level: CefrLevel): 'beginner' | 'intermediate' | 'advanced' {
  if (compareCefr(level, 'A2') <= 0) return 'beginner';
  if (compareCefr(level, 'B2') <= 0) return 'intermediate';
  return 'advanced';
}

/* ── Tutor vetting (PLAN.md 4.6) ───────────────────────────────────── */

/** Overall level a tutor applicant must reach. */
export const TUTOR_MIN_CEFR: CefrLevel = 'C1';
/** No single dimension may be below this. */
export const TUTOR_DIMENSION_FLOOR: CefrLevel = 'B2';

export interface VettingCheck {
  passed: boolean;
  reason: string | null;
}

export function checkTutorProficiency(verdict: CefrVerdict | null): VettingCheck {
  if (!verdict) return { passed: false, reason: 'No graded proficiency interview yet.' };
  if (compareCefr(verdict.overall, TUTOR_MIN_CEFR) < 0) {
    return { passed: false, reason: `Overall level ${verdict.overall} is below ${TUTOR_MIN_CEFR}.` };
  }
  const low = SCORE_DIMENSIONS.filter((d) => {
    const level = verdict.dimensions[d];
    return level != null && compareCefr(level, TUTOR_DIMENSION_FLOOR) < 0;
  });
  if (low.length > 0) {
    return { passed: false, reason: `Below ${TUTOR_DIMENSION_FLOOR} in: ${low.join(', ')}.` };
  }
  return { passed: true, reason: null };
}

/** Days between a learner's placements: the monthly re-test. */
export const PLACEMENT_RETEST_DAYS = 30;

/** How long the placement interview runs. */
export const PLACEMENT_MINUTES = 8;
