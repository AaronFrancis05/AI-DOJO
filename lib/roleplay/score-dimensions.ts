/**
 * The six scoring dimensions, every one on an independent 0-100 scale.
 *
 * These used to be requested on mixed scales that summed to 100 (vocabulary
 * 0-25, grammar 0-20, fluency 0-20, cultural 0-10, task 0-10, expression
 * 0-15). But `computeCompositeScore` in lib/roleplay/phase-engine.ts consumes
 * them as percentages and applies weights that ALSO sum to 1.0 — so a flawless
 * session composited to roughly 18 against a passing threshold of 70, and
 * every learner was permanently reported as underperforming. The same
 * conflation reached the persisted `sessions`/`evaluations` score columns,
 * `buildSessionMetrics`, and `qualitativeTag`.
 *
 * Weighting is now the sole responsibility of `computeCompositeScore`; the
 * model reports each dimension independently out of 100.
 */
export const SCORE_DIMENSIONS = [
  'vocabulary',
  'grammar',
  'fluency',
  'cultural',
  'task',
  'expressionAppropriateness',
] as const;

export type ScoreDimension = typeof SCORE_DIMENSIONS[number];
export type TurnScores = Record<ScoreDimension, number>;
