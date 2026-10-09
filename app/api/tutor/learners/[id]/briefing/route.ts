import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutorBookings } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { loadBriefing } from '@/lib/tutors/briefing';
import {
  hybridEnabledForLearner,
  hybridUnavailableResponse,
  latestBookingBetween,
  tutorIdForUser,
} from '@/lib/tutors/hybrid';

export const runtime = 'nodejs';

/**
 * The pre-lesson briefing on one learner (PLAN.md 4.1).
 *
 * Access is by booking, not by role: being a tutor does not open every
 * learner's mistakes, only those of a learner who booked THIS tutor. Without a
 * booking the answer is 403 — the caller is a tutor and the learner may well
 * exist, so pretending otherwise would only confuse the console.
 *
 * `?bookingId=` picks the booking whose target language the briefing is about;
 * the default is the most recent booking between them.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const learnerId = (await params).id;
  const tutorId = await tutorIdForUser(user.id);
  if (!tutorId) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const bookingParam = new URL(req.url).searchParams.get('bookingId');
  let booking;
  if (bookingParam) {
    const bookingId = Number(bookingParam);
    if (!Number.isInteger(bookingId)) return Response.json({ error: 'Invalid booking id' }, { status: 400 });
    [booking] = await db
      .select()
      .from(tutorBookings)
      .where(and(
        eq(tutorBookings.id, bookingId),
        eq(tutorBookings.tutorId, tutorId),
        eq(tutorBookings.learnerId, learnerId),
        ne(tutorBookings.status, 'cancelled'),
      ))
      .limit(1);
  } else {
    booking = await latestBookingBetween(tutorId, learnerId);
  }

  if (!booking) {
    return Response.json(
      { error: 'You can see a learner\'s briefing once they have booked a lesson with you.' },
      { status: 403 },
    );
  }

  if (!(await hybridEnabledForLearner(learnerId))) return hybridUnavailableResponse();

  const briefing = await loadBriefing({
    learnerId,
    targetLanguage: booking.targetLanguage,
    tutorId,
  });
  if (!briefing) return Response.json({ error: 'Learner not found' }, { status: 404 });

  return Response.json({ success: true, bookingId: booking.id, briefing });
}
