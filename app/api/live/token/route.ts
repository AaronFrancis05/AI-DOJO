import { getAuthUser } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { buildJoinPayload } from '@/lib/tutors/join';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

/**
 * Mints a Stream call token for one 1:1 booking.
 *
 * This is the security boundary for the whole feature: a token IS access to
 * the call, so membership and the join window are both verified here, on the
 * server, before one is issued. The call id is returned only alongside a
 * valid token and is never listed anywhere else.
 */
export async function POST(req: Request) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { bookingId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bookingId = Number(body.bookingId);
  if (!Number.isInteger(bookingId)) {
    return Response.json({ error: 'bookingId is required' }, { status: 400 });
  }

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) {
    return Response.json({ error: 'Booking not found' }, { status: 404 });
  }

  const decision = canJoinBooking(found.booking);
  if (!decision.allowed) {
    return Response.json({ error: decision.reason }, { status: 403 });
  }

  const payload = await buildJoinPayload({
    callId: found.booking.callId,
    callType: found.booking.callType,
    user: { id: user.id, name: user.name },
    ownerUserId: found.tutorUserId,
    ownerName: found.tutorName,
    isTutor: found.isTutor,
  });
  if (payload instanceof Response) return payload;

  return Response.json(payload);
}
