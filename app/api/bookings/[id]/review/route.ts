import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutorReviews } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { evaluateTutorQuality } from '@/lib/tutors/quality';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';

const MAX_COMMENT_CHARS = 2000;

async function resolve(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) ? id : null;
}

/** A booking has been taught once it is marked completed, or once its time has passed while confirmed. */
function lessonHasHappened(booking: { status: string; scheduledAt: Date; durationMinutes: number }): boolean {
  if (booking.status === 'completed') return true;
  return booking.status === 'confirmed'
    && booking.scheduledAt.getTime() + booking.durationMinutes * 60_000 <= Date.now();
}

/** The learner's review of this lesson, for either party (PLAN.md 4.4). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = await resolve(params);
  if (bookingId == null) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });

  const [review] = await db.select().from(tutorReviews).where(eq(tutorReviews.bookingId, bookingId)).limit(1);
  return Response.json({
    success: true,
    review: review ? { rating: review.rating, comment: review.comment, updatedAt: review.updatedAt } : null,
    canReview: found.isLearner && lessonHasHappened(found.booking),
  });
}

/**
 * Rates the lesson, 1-5, with an optional comment. Booking-scoped: one review
 * per booking, revisable by the learner who booked it, and only once the
 * lesson has happened. Each review re-checks the tutor's quality thresholds.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = await resolve(params);
  if (bookingId == null) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });
  if (!found.isLearner) return Response.json({ error: 'Only the learner can review a lesson' }, { status: 403 });
  if (!lessonHasHappened(found.booking)) {
    return Response.json({ error: 'You can review the lesson once it has taken place.' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: 'Rating must be a whole number from 1 to 5' }, { status: 400 });
  }
  const comment = typeof body?.comment === 'string' && body.comment.trim()
    ? body.comment.trim().slice(0, MAX_COMMENT_CHARS)
    : null;

  const now = new Date();
  const [existing] = await db
    .select({ id: tutorReviews.id })
    .from(tutorReviews)
    .where(eq(tutorReviews.bookingId, bookingId))
    .limit(1);

  await db
    .insert(tutorReviews)
    .values({
      bookingId,
      tutorId: found.booking.tutorId,
      learnerId: user.id,
      rating,
      comment,
    })
    .onConflictDoUpdate({
      target: tutorReviews.bookingId,
      set: { rating, comment, updatedAt: now },
    });

  await evaluateTutorQuality(found.booking.tutorId);

  if (!existing) {
    await createNotification({
      userId: found.tutorUserId,
      type: 'tutor_review',
      title: `New review: ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`,
      body: comment?.slice(0, 200) ?? null,
      href: `/live/${bookingId}`,
    });
  }

  return Response.json({ success: true, review: { rating, comment, updatedAt: now } });
}
