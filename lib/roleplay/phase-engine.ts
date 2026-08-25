export type SessionPhase = 'orientation' | 'icebreaker' | 'guided' | 'unguided' | 'evaluation' | 'completed';

export const PRONUNCIATION_PASS_THRESHOLD = 70;
export const PASSING_SCORE_THRESHOLD = 70;
export const STALL_THRESHOLD = 4;
export const SAFETY_CAP_TURN = 25;
export const UNGUIDED_MISTAKE_PENALTY = 5;
export const UNGUIDED_ENGLISH_PENALTY = 10;

export function nextPhase(
  current: SessionPhase,
  opts: {
    icebreakerDone: boolean;
    allGoalsCovered: boolean;
  },
): SessionPhase {
  if (current === 'orientation') return 'icebreaker';
  if (current === 'icebreaker' && opts.icebreakerDone) return 'guided';
  if (current === 'guided' && opts.allGoalsCovered) return 'unguided';
  if (current === 'unguided' && opts.allGoalsCovered) return 'evaluation';
  return current;
}

/**
 * Weights for the composite score. Must sum to 1.0, because every input
 * dimension is an independent 0-100 value (see SCORE_DIMENSIONS in
 * lib/ai-engine.ts) — this function is the single place they are combined.
 *
 * `expressionAppropriateness` previously had no weight at all: it was graded,
 * persisted, and shown on the report, but silently contributed nothing to the
 * pass/fail verdict despite the per-language appropriateness rubric driving it.
 */
const SCORE_WEIGHTS = {
  vocabulary: 0.20,
  grammar: 0.20,
  fluency: 0.20,
  cultural: 0.15,
  task: 0.15,
  expressionAppropriateness: 0.10,
} as const;

/**
 * Combines the six 0-100 dimension scores into a single 0-100 composite,
 * which is what `PASSING_SCORE_THRESHOLD` is compared against.
 */
export function computeCompositeScore(phase: SessionPhase, scores: {
  vocabularyScore: number;
  grammarScore: number;
  fluencyScore: number;
  culturalScore: number;
  taskScore: number;
  expressionAppropriatenessScore?: number;
}): number {
  const clamp = (n: number | undefined | null) =>
    Math.max(0, Math.min(100, Number(n) || 0));

  return Math.round(
    clamp(scores.vocabularyScore) * SCORE_WEIGHTS.vocabulary +
    clamp(scores.grammarScore) * SCORE_WEIGHTS.grammar +
    clamp(scores.fluencyScore) * SCORE_WEIGHTS.fluency +
    clamp(scores.culturalScore) * SCORE_WEIGHTS.cultural +
    clamp(scores.taskScore) * SCORE_WEIGHTS.task +
    clamp(scores.expressionAppropriatenessScore) * SCORE_WEIGHTS.expressionAppropriateness,
  );
}