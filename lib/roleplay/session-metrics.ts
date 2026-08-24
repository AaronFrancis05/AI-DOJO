import type { TurnData, GoalData } from '@/lib/hooks/useRoleplaySession';
import { computeCompositeScore } from './phase-engine';

/** The six persisted dimension scores, as they appear on a session/evaluation row. */
export interface DimensionScores {
  vocabularyScore?: number | null;
  grammarScore?: number | null;
  fluencyScore?: number | null;
  culturalScore?: number | null;
  taskScore?: number | null;
  expressionAppropriatenessScore?: number | null;
}

/**
 * Overall percentage for a scored session.
 *
 * Delegates to `computeCompositeScore` so every surface agrees with the
 * pass/fail the session actually recorded. Three separate hand-rolled versions
 * of this existed — the home and sessions lists both summed five dimensions
 * and divided by 100, and the public share page divided by maxes of
 * 30/25/20/15/10. All three predated the move to independent 0-100 scores and
 * would now report percentages well over 100.
 */
export function sessionCompositePct(s: DimensionScores & { status?: string }): number | null {
  if (s.status && s.status !== 'completed') return null;
  if (s.vocabularyScore == null) return null;

  return computeCompositeScore('completed', {
    vocabularyScore: s.vocabularyScore ?? 0,
    grammarScore: s.grammarScore ?? 0,
    fluencyScore: s.fluencyScore ?? 0,
    culturalScore: s.culturalScore ?? 0,
    taskScore: s.taskScore ?? 0,
    expressionAppropriatenessScore: s.expressionAppropriatenessScore ?? 0,
  });
}

export interface SessionMetrics {
  vocabulary: number;
  accuracy: number;
  fluency: number;
  pronunciation: number | null;
  newWordsCount: number | null;
  goalsCompleted: number;
  goalsTotal: number;
}

export function buildSessionMetrics(opts: {
  evaluation: any | null;
  session: any | null;
  avgPronunciationScore: number | null;
  newWordsCount: number | null;
  completedGoals: number[];
  goals: GoalData[];
}): SessionMetrics {
  const vocabulary = opts.evaluation?.vocabularyScore ?? opts.session?.vocabularyScore ?? 0;
  const accuracy = opts.evaluation?.grammarScore ?? opts.session?.grammarScore ?? 0;
  const fluency = opts.evaluation?.fluencyScore ?? opts.session?.fluencyScore ?? 0;
  return {
    vocabulary,
    accuracy,
    fluency,
    pronunciation: opts.avgPronunciationScore,
    newWordsCount: opts.newWordsCount,
    goalsCompleted: opts.completedGoals.length,
    goalsTotal: opts.goals.length,
  };
}

export function qualitativeTag(score: number): string {
  if (score >= 95) return 'Outstanding!';
  if (score >= 85) return 'Amazing!';
  if (score >= 75) return 'Great!';
  if (score >= 70) return 'Good!';
  return 'Keep practicing';
}

function correctionBucketLabel(correctionType: string | undefined): string {
  const type = (correctionType ?? '').toLowerCase();
  if (type.includes('pronunc')) return 'Pronunciation errors';
  if (type.includes('vocab')) return 'Missed key phrases';
  if (type.includes('polite') || type.includes('cultural')) return 'Cultural / politeness slips';
  return 'Grammar mistakes';
}

export function buildWhatWentWrong(opts: { conversations: TurnData[]; metrics: SessionMetrics }): string[] {
  const counts = new Map<string, number>();
  for (const turn of opts.conversations) {
    for (const correction of turn.corrections ?? []) {
      const label = correctionBucketLabel(correction.correctionType);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);

  if (opts.metrics.fluency < 70 && !ranked.includes('Fluency below target')) ranked.push('Fluency below target');
  if (opts.metrics.vocabulary < 70 && !ranked.includes('Vocabulary below target')) ranked.push('Vocabulary below target');

  return ranked.slice(0, 5);
}
