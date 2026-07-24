export type SessionPhase = 'icebreaker' | 'guided' | 'unguided' | 'evaluation' | 'completed';

export const PRONUNCIATION_PASS_THRESHOLD = 70;
export const UNGUIDED_MISTAKE_PENALTY = 5;
export const UNGUIDED_ENGLISH_PENALTY = 10;

export function nextPhase(
  current: SessionPhase,
  opts: {
    icebreakerDone: boolean;
    allGoalsCovered: boolean;
  },
): SessionPhase {
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
}): typeof scores {
  return { ...scores };
}