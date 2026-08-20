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

export function computeCompositeScore(phase: SessionPhase, scores: {
  vocabularyScore: number;
  grammarScore: number;
  fluencyScore: number;
  culturalScore: number;
  taskScore: number;
  expressionAppropriatenessScore?: number;
}): number {
  const v = scores.vocabularyScore ?? 0;
  const g = scores.grammarScore ?? 0;
  const f = scores.fluencyScore ?? 0;
  const c = scores.culturalScore ?? 0;
  const t = scores.taskScore ?? 0;
  return Math.round(v * 0.25 + g * 0.25 + f * 0.20 + c * 0.15 + t * 0.15);
}