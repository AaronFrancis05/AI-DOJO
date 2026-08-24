import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import {
  tutorBookings,
  tutors,
  users,
  sessions,
  chatRooms,
  chatRoomMembers,
} from '@/src/schema';
import { and, desc, eq, gte, ne, or } from 'drizzle-orm';
import { getAuthUser } from '@/lib/auth/server';
import { generateRoomName } from '@/lib/tutors/rooms';
import { BOOKING_DURATIONS_MINUTES } from '@/lib/tutors/config';

/** Rolls the booking transaction back and maps to the 409 response. */
class SlotTakenError extends Error {}

function isExclusionViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23P01';
}

/** Bookings the signed-in user is part of, as either learner or tutor. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [tutorProfile] = await db.select().from(tutors).where(eq(tutors.userId, user.id));

  const rows = await db
    .select({
      booking: tutorBookings,
      tutorName: users.name,
      tutorHeadline: tutors.headline,
    })
    .from(tutorBookings)
    .innerJoin(tutors, eq(tutorBookings.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(
      tutorProfile
        ? or(eq(tutorBookings.learnerId, user.id), eq(tutorBookings.tutorId, tutorProfile.id))
        : eq(tutorBookings.learnerId, user.id),
    )
    .orderBy(desc(tutorBookings.scheduledAt));

  return Response.json({
    success: true,
    bookings: rows.map(({ booking, tutorName, tutorHeadline }) => ({
      id: booking.id,
      tutorId: booking.tutorId,
      tutorName,
      tutorHeadline,
      sessionId: booking.sessionId,
      targetLanguage: booking.targetLanguage,
      scheduledAt: booking.scheduledAt,
      durationMinutes: booking.durationMinutes,
      status: booking.status,
      purpose: booking.purpose,
      learnerNote: booking.learnerNote,
      chatRoomId: booking.chatRoomId,
      // The room NAME is intentionally not exposed here. It is only ever
      // handed out alongside a token from /api/live/token, after the
      // join-window and membership checks have passed.
      isTutor: tutorProfile ? booking.tutorId === tutorProfile.id : false,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tutorId = Number(body.tutorId);
  const scheduledAtRaw = String(body.scheduledAt ?? '');
  const durationMinutes = Number(body.durationMinutes ?? 30);
  const targetLanguage = String(body.targetLanguage ?? '').trim();
  const purpose = body.purpose === 'evaluation' ? 'evaluation' : 'lesson';
  const learnerNote = body.learnerNote ? String(body.learnerNote).slice(0, 2000) : null;
  const sessionId = body.sessionId != null ? Number(body.sessionId) : null;

  if (!Number.isInteger(tutorId) || !targetLanguage) {
    return Response.json({ error: 'tutorId and targetLanguage are required' }, { status: 400 });
  }

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    return Response.json({ error: 'scheduledAt must be a valid date' }, { status: 400 });
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return Response.json({ error: 'Cannot book a time in the past' }, { status: 400 });
  }
  if (!(BOOKING_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
    return Response.json({ error: 'Unsupported duration' }, { status: 400 });
  }

  const [tutor] = await db.select().from(tutors).where(eq(tutors.id, tutorId));
  if (!tutor || tutor.verificationStatus !== 'verified' || !tutor.isAcceptingBookings) {
    return Response.json({ error: 'Tutor is not available for booking' }, { status: 404 });
  }
  if (tutor.userId === user.id) {
    return Response.json({ error: 'You cannot book yourself' }, { status: 400 });
  }

  // An evaluation booking must reference a session the learner actually owns —
  // otherwise it would be a way to expose someone else's transcript to a tutor.
  if (sessionId != null) {
    if (!Number.isInteger(sessionId)) {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
    }
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session || session.userId !== user.id) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
  }

  // The chat room, its membership and the booking are one unit of work: a
  // booking without its room is unreachable from /messages, and a room with no
  // booking is an orphan the learner can never close. One transaction, so a
  // failure anywhere leaves none of them behind.
  const requestedEnd = scheduledAt.getTime() + durationMinutes * 60 * 1000;

  let bookingId: number | null;
  try {
    bookingId = await dbPool.transaction(async (tx) => {
      // Read-side overlap check: gives the friendly 409 in the common case.
      // The exclusion constraint below it is what actually makes the rule
      // hold when two learners book the same slot at the same moment.
      const existing = await tx
        .select({ scheduledAt: tutorBookings.scheduledAt, durationMinutes: tutorBookings.durationMinutes })
        .from(tutorBookings)
        .where(and(
          eq(tutorBookings.tutorId, tutorId),
          ne(tutorBookings.status, 'cancelled'),
          gte(tutorBookings.scheduledAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ));

      const clashes = existing.some((b) => {
        const start = b.scheduledAt.getTime();
        return scheduledAt.getTime() < start + b.durationMinutes * 60 * 1000 && requestedEnd > start;
      });
      if (clashes) throw new SlotTakenError();

      // Tutor↔learner chat reuses the existing messaging tables, including their
      // per-member preferredLanguage translation — a good fit when the two people
      // may not share a language.
      const [room] = await tx.insert(chatRooms).values({
        name: `Lesson with ${tutor.headline}`.slice(0, 150),
        isGroup: false,
        createdBy: user.id,
      }).returning({ id: chatRooms.id });

      if (room) {
        await tx.insert(chatRoomMembers)
          .values([
            { roomId: room.id, userId: user.id },
            { roomId: room.id, userId: tutor.userId },
          ])
          .onConflictDoNothing();
      }

      const [booking] = await tx.insert(tutorBookings).values({
        tutorId,
        learnerId: user.id,
        sessionId,
        targetLanguage,
        scheduledAt,
        durationMinutes,
        status: 'requested',
        purpose,
        learnerNote,
        livekitRoomName: generateRoomName(),
        chatRoomId: room?.id ?? null,
      }).returning({ id: tutorBookings.id });

      return booking?.id ?? null;
    });
  } catch (err) {
    // 23P01 = exclusion_violation, raised by tutor_bookings_no_overlap when a
    // concurrent request won the same slot between the check and the insert.
    if (err instanceof SlotTakenError || isExclusionViolation(err)) {
      return Response.json({ error: 'That slot has just been taken' }, { status: 409 });
    }
    throw err;
  }

  return Response.json({ success: true, bookingId }, { status: 201 });
}
