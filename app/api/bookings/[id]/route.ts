import { db } from '@/src/db';
import { tutorBookings } from '@/src/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, requireRole, roleErrorResponse } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';

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

  return Response.json({ success: true, status });
}

