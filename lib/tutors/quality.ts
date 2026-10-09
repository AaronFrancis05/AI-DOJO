/**
 * Tutor quality and trust, read from the database (PLAN.md 4.4, 4.6).
 * The thresholds and decisions are pure, in ./quality-rules.ts.
 */

import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutorBookings, tutorEvaluations, tutorReviews, tutors } from '@/src/schema';
import { qualityFlagReason, type TutorQualityStats } from './quality-rules';

export interface TutorTrust extends TutorQualityStats {
  tutorId: number;
  completedLessons: number;
  cefrLevel: string | null;
  clarityScore: number | null;
}

/** The trust-badge numbers for a set of tutors, keyed by tutor id. */
export async function loadTutorTrust(tutorIds: number[]): Promise<Map<number, TutorTrust>> {
  const out = new Map<number, TutorTrust>();
  if (tutorIds.length === 0) return out;

  const [profiles, reviewRows, evalRows, lessonRows] = await Promise.all([
    db
      .select({ id: tutors.id, cefrLevel: tutors.cefrLevel, clarityScore: tutors.clarityScore })
      .from(tutors)
      .where(inArray(tutors.id, tutorIds)),
    db
      .select({
        tutorId: tutorReviews.tutorId,
        n: count(),
        avg: sql<string | null>`avg(${tutorReviews.rating})`,
      })
      .from(tutorReviews)
      .where(inArray(tutorReviews.tutorId, tutorIds))
      .groupBy(tutorReviews.tutorId),
    db
      .select({
        tutorId: tutorEvaluations.tutorId,
        n: count(),
        agrees: sql<number>`count(*) filter (where ${tutorEvaluations.agreesWithAi} = 'agrees')::int`,
      })
      .from(tutorEvaluations)
      .where(and(inArray(tutorEvaluations.tutorId, tutorIds), sql`${tutorEvaluations.agreesWithAi} is not null`))
      .groupBy(tutorEvaluations.tutorId),
    db
      .select({ tutorId: tutorBookings.tutorId, n: count() })
      .from(tutorBookings)
      .where(and(inArray(tutorBookings.tutorId, tutorIds), eq(tutorBookings.status, 'completed')))
      .groupBy(tutorBookings.tutorId),
  ]);

  const reviews = new Map(reviewRows.map((r) => [r.tutorId, r]));
  const evals = new Map(evalRows.map((r) => [r.tutorId, r]));
  const lessons = new Map(lessonRows.map((r) => [r.tutorId, r.n]));

  for (const p of profiles) {
    const r = reviews.get(p.id);
    const e = evals.get(p.id);
    out.set(p.id, {
      tutorId: p.id,
      cefrLevel: p.cefrLevel,
      clarityScore: p.clarityScore,
      completedLessons: lessons.get(p.id) ?? 0,
      reviewCount: r?.n ?? 0,
      averageRating: r?.avg != null ? Math.round(Number(r.avg) * 10) / 10 : null,
      evaluationCount: e?.n ?? 0,
      agreementRate: e && e.n > 0 ? e.agrees / e.n : null,
    });
  }
  return out;
}

/**
 * Re-checks one tutor after a new review or evaluation, and flags them for
 * re-review when a signal falls below threshold. Never clears a flag: that is
 * the admin's decision after looking, not a side effect of one good review.
 */
export async function evaluateTutorQuality(tutorId: number): Promise<string | null> {
  const trust = (await loadTutorTrust([tutorId])).get(tutorId);
  if (!trust) return null;
  const reason = qualityFlagReason(trust);
  if (reason) {
    await db
      .update(tutors)
      .set({ reviewFlaggedAt: new Date(), reviewFlagReason: reason })
      .where(and(eq(tutors.id, tutorId), isNull(tutors.reviewFlaggedAt)));
  }
  return reason;
}
