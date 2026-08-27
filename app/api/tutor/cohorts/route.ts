import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import { chatRoomMembers, chatRooms, classSessions, tutors } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { isAudienceKind, resolveAudience } from '@/lib/tutors/audience';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

/**
 * A tutor's standing group chat rooms.
 *
 * Distinct from the room a `class_session` creates for itself: that one is
 * scoped to a single scheduled meeting and disappears from view once it is
 * over. A cohort room outlives any one class, which is what "a group chat for
 * all the learners in my class" actually asks for.
 *
 * It is a normal `chat_rooms` row, so it inherits the existing UgaJapa
 * per-reader translation, the realtime transport, and `/messages/[roomId]` —
 * no second chat surface.
 */
export async function GET() {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [profile] = await db.select({ id: tutors.id }).from(tutors).where(eq(tutors.userId, user.id)).limit(1);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const rooms = await db
    .select({ id: chatRooms.id, name: chatRooms.name, createdAt: chatRooms.createdAt })
    .from(chatRooms)
    .where(and(eq(chatRooms.ownerTutorId, profile.id), eq(chatRooms.kind, 'cohort')));

  return Response.json({ success: true, rooms });
}

/**
 * Creates the cohort room, or tops up the one that already exists.
 *
 * Re-running is the normal case, not an error: learners enrol after the room
 * was made, and the tutor's answer to "add the new people" is to press the
 * same button. Membership inserts are `onConflictDoNothing` against
 * `uq_chat_room_member`, so a second call adds only who is missing and never
 * resets anyone's `preferredLanguage` or `lastReadAt`.
 */
export async function POST(req: Request) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [profile] = await db.select().from(tutors).where(eq(tutors.userId, user.id)).limit(1);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });
  if (profile.verificationStatus !== 'verified') {
    return Response.json(
      { error: 'Your tutor profile is still awaiting verification.' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const audienceKind = body.audienceKind;
  if (!isAudienceKind(audienceKind)) {
    return Response.json({ error: 'Unknown audience' }, { status: 400 });
  }

  const classSessionId = body.classSessionId != null ? Number(body.classSessionId) : null;
  const courseId = body.courseId != null ? Number(body.courseId) : null;
  const targetLanguage = body.targetLanguage ? String(body.targetLanguage).trim() : null;

  const audience = await resolveAudience(profile.id, audienceKind, {
    classSessionId,
    courseId,
    targetLanguage,
  });
  if (audience.error) return Response.json({ error: audience.error }, { status: 400 });
  if (audience.learnerIds.length === 0) {
    return Response.json({ error: 'There is nobody to add yet.' }, { status: 400 });
  }

  // The room's default reading language. For a class room it is what the class
  // is taught in, so the sidebar opens in the language of the lesson rather
  // than each member's own. Null keeps the pre-existing per-reader behaviour.
  let preferredLanguage: string | null = null;
  let name = 'My learners';

  if (audienceKind === 'class' && classSessionId) {
    const [cls] = await db
      .select({ title: classSessions.title, instructionLanguage: classSessions.instructionLanguage })
      .from(classSessions)
      .where(and(eq(classSessions.id, classSessionId), eq(classSessions.tutorId, profile.id)))
      .limit(1);
    if (!cls) return Response.json({ error: 'Class not found' }, { status: 404 });
    preferredLanguage = cls.instructionLanguage;
    name = cls.title;
  } else if (typeof body.name === 'string' && body.name.trim()) {
    name = body.name.trim();
  }

  const roomId = await dbPool.transaction(async (tx) => {
    // Re-use is keyed on (ownerTutorId, kind, name) rather than on the audience
    // scope, because the scope can legitimately change — a tutor renames a
    // cohort or widens it — while the room, and its message history, should not.
    const [existing] = await tx
      .select({ id: chatRooms.id })
      .from(chatRooms)
      .where(and(
        eq(chatRooms.ownerTutorId, profile.id),
        eq(chatRooms.kind, 'cohort'),
        eq(chatRooms.name, name.slice(0, 150)),
      ))
      .limit(1);

    const id = existing
      ? existing.id
      : (
          await tx
            .insert(chatRooms)
            .values({
              name: name.slice(0, 150),
              isGroup: true,
              kind: 'cohort',
              ownerTutorId: profile.id,
              createdBy: user.id,
            })
            .returning({ id: chatRooms.id })
        )[0].id;

    // The tutor is a member too — without this the room they just made 403s
    // for them, the same trap /api/classes avoids for a class room.
    await tx
      .insert(chatRoomMembers)
      .values([
        { roomId: id, userId: user.id, preferredLanguage: null },
        ...audience.learnerIds.map((learnerId) => ({
          roomId: id,
          userId: learnerId,
          preferredLanguage,
        })),
      ])
      .onConflictDoNothing();

    return id;
  });

  // Read back rather than derived from `audience.learnerIds`: on a top-up run
  // most of those were already members, so the resolved count would overstate
  // what the room holds.
  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(chatRoomMembers)
    .where(eq(chatRoomMembers.roomId, roomId));

  return Response.json({ success: true, roomId, memberCount: Number(memberCount) }, { status: 201 });
}
