import { db } from '@/src/db';
import { tutorBookings } from '@/src/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, requireRole, roleErrorResponse } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { createNotification } from '@/lib/notifications';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) {
    return Response.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });

  const { booking, tutorName, isTutor } = found;
  return Response.json({
    success: true,
    booking: {
      id: booking.id,
      tutorId: booking.tutorId,
      tutorName,
      sessionId: booking.sessionId,
      targetLanguage: booking.targetLanguage,
      scheduledAt: booking.scheduledAt,
      durationMinutes: booking.durationMinutes,
      status: booking.status,
      purpose: booking.purpose,
      learnerNote: booking.learnerNote,
      chatRoomId: booking.chatRoomId,
      isTutor,
    },
  });
}

/**
 * Status transitions. Who may make which move is deliberately asymmetric:
 * only the tutor confirms or completes; either side may cancel.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) {
    return Response.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const status = String(body.status ?? '');
  if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
    return Response.json({ error: 'Unsupported status' }, { status: 400 });
  }

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });

  if (status === 'confirmed' || status === 'completed') {
    if (!found.isTutor) {
      return Response.json({ error: 'Only the tutor can do that' }, { status: 403 });
    }
    // Being the booking's tutor is not the same as still being authorised to
    // teach — a rejected application keeps the `tutors` row and only drops
    // `users.role`.
    try {
      await requireRole('tutor');
    } catch (err) {
      return roleErrorResponse(err);
    }
  }
  if (found.booking.status === 'cancelled') {
    return Response.json({ error: 'This booking was already cancelled' }, { status: 409 });
  }

  await db.update(tutorBookings)
    .set({ status, updatedAt: new Date() })
    .where(eq(tutorBookings.id, bookingId));

  // Whoever did not make the move is the one who needs telling. Without this a
  // learner had no way to find out their request had been accepted except by
  // going back and looking, which is not a booking system so much as a form.
  //
  // After the update, never before: a notification about a transition that
  // then failed to write would be worse than none.
  const when = found.booking.scheduledAt.toLocaleString();
  const actorIsTutor = found.isTutor;
  const counterpartyId = actorIsTutor ? found.booking.learnerId : found.tutorUserId;

  if (status === 'confirmed') {
    await createNotification({
      userId: found.booking.learnerId,
      type: 'booking',
      title: 'Your lesson is confirmed',
      body: `${found.tutorName} confirmed your ${found.booking.durationMinutes}-minute session on ${when}.`,
      href: `/live/${bookingId}`,
    });
  } else if (status === 'completed') {
    await createNotification({
      userId: found.booking.learnerId,
      type: 'booking',
      title: 'Your lesson is wrapped up',
      body: `${found.tutorName} marked your session on ${when} complete.`,
      href: `/live/${bookingId}`,
    });
  } else if (status === 'cancelled') {
    await createNotification({
      userId: counterpartyId,
      type: 'booking',
      title: actorIsTutor ? 'Your lesson was cancelled' : 'A learner cancelled',
      body: `The session on ${when} will not go ahead.`,
      href: '/tutors',
    });
  }

  return Response.json({ success: true, status });
}

