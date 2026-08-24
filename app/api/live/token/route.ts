import { getAuthUser } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { canJoinBooking, createRoomToken } from '@/lib/tutors/rooms';
import { getLiveKitConfig, TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

/**
 * Mints a LiveKit access token for one booking's room.
 *
 * This is the security boundary for the whole feature: a token IS access to
 * the room, so membership and the join window are both verified here, on the
 * server, before one is issued. The room name is returned only alongside a
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

  const config = getLiveKitConfig();
  if (!config) {
    return Response.json(
      { error: 'Live tutoring is not configured on this server.' },
      { status: 503 },
    );
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

  const token = await createRoomToken({
    roomName: found.booking.livekitRoomName,
    // Namespaced so a LiveKit identity can never collide with another user's.
    identity: `user-${user.id}`,
    displayName: user.name ?? 'Participant',
    isTutor: found.isTutor,
  });

  if (!token) {
    return Response.json(
      { error: 'Live tutoring is not configured on this server.' },
      { status: 503 },
    );
  }

  return Response.json({
    success: true,
    token,
    url: config.url,
    roomName: found.booking.livekitRoomName,
    isTutor: found.isTutor,
  });
}
