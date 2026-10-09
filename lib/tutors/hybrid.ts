/**
 * Who the hybrid tutoring layer (PLAN.md Phase 4) is switched on for.
 *
 * Two gates. `HYBRID_ENABLED` (build-time, NEXT_PUBLIC_HYBRID_ENABLED) hides
 * every surface when off. The per-organization switch
 * (`organizations.hybrid_tutoring_enabled`) then decides which LEARNERS get the
 * lesson tools — briefings, AI lesson plans, captions, in-lesson explanations —
 * so the pilot customer gets them first (PLAN.md 4.5, "Development approach").
 * The learner's organization decides, not the tutor's: tutors belong to none.
 */

import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db';
import { organizationMemberships, organizations, tutorBookings, tutors } from '@/src/schema';
import { HYBRID_ENABLED } from './config';

export async function hybridEnabledForLearner(learnerId: string): Promise<boolean> {
  if (!HYBRID_ENABLED) return false;
  const [row] = await db
    .select({ enabled: organizations.hybridTutoringEnabled })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(eq(organizationMemberships.userId, learnerId))
    .limit(1);
  return row?.enabled ?? false;
}

/** The 404 every hybrid route answers when the layer is off for this learner. */
export function hybridUnavailableResponse(): Response {
  return Response.json({ error: 'Not available for this learner yet.' }, { status: 404 });
}

/** The caller's tutor profile id, or null. */
export async function tutorIdForUser(userId: string): Promise<number | null> {
  const [row] = await db.select({ id: tutors.id }).from(tutors).where(eq(tutors.userId, userId)).limit(1);
  return row?.id ?? null;
}

/**
 * The tutor's most recent non-cancelled booking with this learner, or null.
 * This is the ownership check on learner data (PLAN.md 4.1): a tutor sees a
 * learner's mistakes only because that learner booked them.
 */
export async function latestBookingBetween(tutorId: number, learnerId: string) {
  const [row] = await db
    .select()
    .from(tutorBookings)
    .where(and(
      eq(tutorBookings.tutorId, tutorId),
      eq(tutorBookings.learnerId, learnerId),
      ne(tutorBookings.status, 'cancelled'),
    ))
    .orderBy(desc(tutorBookings.scheduledAt))
    .limit(1);
  return row ?? null;
}
