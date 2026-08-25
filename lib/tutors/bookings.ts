import { db } from '@/src/db';
import { tutorBookings, tutors, users } from '@/src/schema';
import { eq } from 'drizzle-orm';

/**
 * Resolves a booking together with the caller's role in it, or null if the
 * booking doesn't exist or the caller isn't party to it.
 *
 * Every booking route needs the same three answers — does it exist, is the
 * caller party to it, and are they the tutor or the learner. Collapsing
 * "not found" and "not yours" into a single null is deliberate: the API
 * returns 404 for both, so a stranger cannot probe which booking ids exist.
 */
export async function loadBookingForUser(bookingId: number, userId: string) {
  const [row] = await db
    .select({
      booking: tutorBookings,
      tutorUserId: tutors.userId,
      tutorName: users.name,
    })
    .from(tutorBookings)
    .innerJoin(tutors, eq(tutorBookings.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(eq(tutorBookings.id, bookingId));

  if (!row) return null;

  const isTutor = row.tutorUserId === userId;
  const isLearner = row.booking.learnerId === userId;
  if (!isTutor && !isLearner) return null;

  return { ...row, isTutor, isLearner };
}
