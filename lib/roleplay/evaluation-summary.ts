import { db } from '@/src/db';
import { conversations, corrections, vocabularyEncounters } from '@/src/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { computeCompositeScore, PASSING_SCORE_THRESHOLD } from './phase-engine';
import type { EvaluationSummary } from './prompts';

/**
 * Assembles the scorecard the evaluation phase speaks aloud.
 *
 * Everything here already existed in the database and was never surfaced to
 * the learner in words: the blended per-dimension scores sat on the session
 * row, the icebreaker pass rate was only ever folded into the final
 * vocabulary number, and `conversations.responseTimeMs` was recorded on every
 * turn and read by nothing at all.
 *
 * Response time is reported as a pacing observation rather than scored.
 * Adding it as a seventh dimension would mean re-weighting SCORE_WEIGHTS in
 * phase-engine.ts, which every report surface and `sessionCompositePct`
 * depends on summing to 1.0.
 */

/** How many of the session's corrections are worth naming in the debrief. */
const MAX_NOTABLE_CORRECTIONS = 3;

interface BuildEvaluationSummaryInput {
  sessionId: number;
  scores: {
    vocabularyScore: number;
    grammarScore: number;
    fluencyScore: number;
    culturalScore: number;
    taskScore: number;
    expressionAppropriatenessScore: number;
  };
  goalsCovered: number;
  goalsTotal: number;
}

export async function buildEvaluationSummary({
  sessionId,
  scores,
  goalsCovered,
  goalsTotal,
}: BuildEvaluationSummaryInput): Promise<EvaluationSummary> {
  const [icebreakerStats, responseTimes, correctionRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        passed: sql<number>`count(*) filter (where used_correctly = true)::int`,
      })
      .from(vocabularyEncounters)
      .where(and(
        eq(vocabularyEncounters.sessionId, sessionId),
        eq(vocabularyEncounters.phase, 'icebreaker'),
      )),
    db
      .select({ ms: conversations.responseTimeMs })
      .from(conversations)
      .where(and(
        eq(conversations.sessionId, sessionId),
        eq(conversations.speaker, 'user'),
        isNotNull(conversations.responseTimeMs),
      )),
    // `corrections` hangs off a conversation turn, not off the session, so
    // the session's corrections are only reachable through that join.
    db
      .select({
        original: corrections.originalText,
        corrected: corrections.correctedText,
      })
      .from(corrections)
      .innerJoin(conversations, eq(corrections.conversationId, conversations.id))
      .where(eq(conversations.sessionId, sessionId))
      .orderBy(corrections.id),
  ]);

  const drilled = icebreakerStats[0]?.total ?? 0;
  const icebreakerRecallPct = drilled > 0
    ? Math.round(((icebreakerStats[0]?.passed ?? 0) / drilled) * 100)
    : null;

  const composite = computeCompositeScore('completed', scores);

  return {
    vocabulary: scores.vocabularyScore,
    grammar: scores.grammarScore,
    fluency: scores.fluencyScore,
    cultural: scores.culturalScore,
    task: scores.taskScore,
    expressionAppropriateness: scores.expressionAppropriatenessScore,
    composite,
    passed: composite >= PASSING_SCORE_THRESHOLD,
    passingScore: PASSING_SCORE_THRESHOLD,
    icebreakerRecallPct,
    medianResponseMs: medianOf(responseTimes.map((r) => r.ms).filter((n): n is number => typeof n === 'number')),
    // The last few are the ones still fresh enough for the learner to place.
    notableCorrections: correctionRows.slice(-MAX_NOTABLE_CORRECTIONS),
    goalsCovered,
    goalsTotal,
  };
}

/**
 * Median rather than mean: one turn where the learner walked away from the
 * screen would drag an average into meaninglessness.
 */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
