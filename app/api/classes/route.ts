import { and, asc, desc, eq, gte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  chatRoomMembers,
  chatRooms,
  classEnrollments,
  classSessions,
  tutors,
  units,
  users,
} from '@/src/schema';
import { getAuthUser, requireRole, roleErrorResponse } from '@/lib/auth/server';
import { generateCallId } from '@/lib/tutors/rooms';
import {
  CLASS_DURATIONS_MINUTES,
  DEFAULT_CALL_TYPE,
  MAX_CLASS_CAPACITY,
  TUTORS_ENABLED,
} from '@/lib/tutors/config';
import { dbPool } from '@/src/db-pool';
import { tutorLanguageError } from '@/lib/tutors/languages';
import { announceLive } from '@/lib/tutors/live';
import { resolveRoomAnchor } from '@/lib/curriculum/room-anchor';

export const runtime = 'nodejs';

/**
 * Scheduled group classes.
 *
 * GET is deliberately broad — a learner browsing what is on, a tutor looking
 * at their own schedule, and the course page asking "is there a live lesson
 * for this unit?" are the same query with different filters:
 *
 *   ?mine=1      only classes I teach or am enrolled in
 *   ?unitId=N    only classes pinned to that curriculum unit
 *   ?past=1      include classes that have already finished
 */
export async function GET(req: Request) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const mine = url.searchParams.get('mine') === '1';
  const unitIdRaw = url.searchParams.get('unitId');
  const unitId = unitIdRaw != null ? Number(unitIdRaw) : null;
  const includePast = url.searchParams.get('past') === '1';

  const [tutorProfile] = await db
    .select({ id: tutors.id })
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);

  const conditions = [sql`${classSessions.status} <> 'cancelled'`];
  if (unitId != null && Number.isInteger(unitId)) {
    conditions.push(eq(classSessions.unitId, unitId));
  }
  if (!includePast) {
    // A class stays listed for an hour past its start so someone running late
    // can still find it — unless it is actually live, in which case it stays
    // listed for as long as it is. A 90-minute class vanishing from the page
    // at the hour mark, while the tutor is still in the room, is the one case
    // a fixed cutoff gets exactly backwards.
    conditions.push(or(
      eq(classSessions.status, 'live'),
      gte(classSessions.scheduledAt, new Date(Date.now() - 60 * 60 * 1000)),
    )!);
  }

  const rows = await db
    .select({
      classSession: classSessions,
      tutorName: users.name,
      tutorAvatar: users.avatarSrc,
      unitTitle: units.title,
      enrolledCount: sql<number>`(
        select count(*)::int from ${classEnrollments}
        where ${classEnrollments.classSessionId} = ${classSessions.id}
          and ${classEnrollments.status} <> 'cancelled'
      )`,
      myEnrollmentStatus: sql<string | null>`(
        select ${classEnrollments.status} from ${classEnrollments}
        where ${classEnrollments.classSessionId} = ${classSessions.id}
          and ${classEnrollments.learnerId} = ${user.id}
        limit 1
      )`,
    })
    .from(classSessions)
    .innerJoin(tutors, eq(classSessions.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .leftJoin(units, eq(classSessions.unitId, units.id))
    .where(and(...conditions))
    .orderBy(includePast ? desc(classSessions.scheduledAt) : asc(classSessions.scheduledAt))
    .limit(100);

  const visible = mine
    ? rows.filter(
        (r) =>
          (tutorProfile && r.classSession.tutorId === tutorProfile.id) ||
          r.myEnrollmentStatus != null,
      )
    : rows;

  return Response.json({
    success: true,
    classes: visible.map((r) => ({
      id: r.classSession.id,
      title: r.classSession.title,
      description: r.classSession.description,
      tutorId: r.classSession.tutorId,
      tutorName: r.tutorName,
      tutorAvatarSrc: r.tutorAvatar,
      courseId: r.classSession.courseId,
      unitId: r.classSession.unitId,
      unitTitle: r.unitTitle,
      targetLanguage: r.classSession.targetLanguage,
      instructionLanguage: r.classSession.instructionLanguage,
      scheduledAt: r.classSession.scheduledAt,
      durationMinutes: r.classSession.durationMinutes,
      capacity: r.classSession.capacity,
      enrolledCount: Number(r.enrolledCount),
      status: r.classSession.status,
      myEnrollmentStatus: r.myEnrollmentStatus,
      // The call id is never listed. It is handed out only alongside a token
      // from /api/live/class/[classId]/token, after the checks there pass.
      isTutor: Boolean(tutorProfile && r.classSession.tutorId === tutorProfile.id),
    })),
  });
}

/** Creates a class. Tutors only — a learner cannot schedule teaching. */
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

  const [tutorProfile] = await db
    .select()
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);
  if (!tutorProfile) {
    return Response.json({ error: 'No tutor profile' }, { status: 404 });
  }
  if (tutorProfile.verificationStatus !== 'verified') {
    return Response.json(
      { error: 'Your tutor profile is still awaiting verification.' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, 150);
  const description = body.description ? String(body.description).slice(0, 2000) : null;
  const targetLanguage = String(body.targetLanguage ?? '').trim();
  const instructionLanguage = body.instructionLanguage
    ? String(body.instructionLanguage).trim()
    : null;
  const durationMinutes = Number(body.durationMinutes ?? 60);
  const capacity = Number(body.capacity ?? 12);
  // A drop-in: the tutor is opening the room right now rather than booking it.
  // `scheduledAt` is then the moment of creation, and the room is born 'live'
  // — there is no earlier state for it to have been in.
  const startNow = body.startNow === true;
  const scheduledAt = startNow ? new Date() : new Date(String(body.scheduledAt ?? ''));

  if (!title || !targetLanguage) {
    return Response.json({ error: 'title and targetLanguage are required' }, { status: 400 });
  }
  // A tutor may only schedule in a pair they actually hold. Checked here and
  // not only in the console, which is a convenience rather than a boundary.
  const languageError = tutorLanguageError(tutorProfile, targetLanguage, instructionLanguage);
  if (languageError) {
    return Response.json({ error: languageError }, { status: 400 });
  }
  // The future check applies to the scheduled path only: "now" is by definition
  // not in the future by the time the insert runs.
  if (!startNow && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) {
    return Response.json({ error: 'scheduledAt must be a future date' }, { status: 400 });
  }
  const anchor = await resolveRoomAnchor(body.courseId, body.unitId);
  if (!anchor.ok) {
    return Response.json({ error: anchor.error }, { status: 400 });
  }
  if (!(CLASS_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
    return Response.json({ error: 'Unsupported duration' }, { status: 400 });
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CLASS_CAPACITY) {
    return Response.json(
      { error: `Capacity must be between 1 and ${MAX_CLASS_CAPACITY}` },
      { status: 400 },
    );
  }

  // The class and its chat room are one unit of work, for the same reason a
  // booking and its room are: a class whose chat room failed to create would
  // have a sidebar nobody can post in.
  const classId = await dbPool.transaction(async (tx) => {
    const [room] = await tx
      .insert(chatRooms)
      .values({
        name: title.slice(0, 150),
        isGroup: true,
        kind: 'class',
        ownerTutorId: tutorProfile.id,
        createdBy: user.id,
      })
      .returning({ id: chatRooms.id });

    if (room) {
      await tx
        .insert(chatRoomMembers)
        .values({ roomId: room.id, userId: user.id })
        .onConflictDoNothing();
    }

    const [created] = await tx
      .insert(classSessions)
      .values({
        tutorId: tutorProfile.id,
        courseId: anchor.courseId,
        unitId: anchor.unitId,
        title,
        description,
        targetLanguage,
        instructionLanguage,
        scheduledAt,
        durationMinutes,
        capacity,
        callId: generateCallId(),
        callType: DEFAULT_CALL_TYPE,
        chatRoomId: room?.id ?? null,
        status: startNow ? 'live' : 'scheduled',
        wentLiveAt: startNow ? scheduledAt : null,
      })
      .returning({ id: classSessions.id });

    return created?.id ?? null;
  });

  // After the transaction, never inside it: the announcement is a courtesy on
  // top of a class that already exists, and a slow fan-out must not hold a
  // write lock open. A scheduled class announces itself later, when the tutor
  // PATCHes it live.
  if (startNow && classId != null) {
    await announceLive({
      kind: 'class',
      tutorId: tutorProfile.id,
      tutorName: user.name ?? 'Your tutor',
      title,
      courseId: anchor.courseId,
      targetLanguage,
      href: `/live/class/${classId}`,
    });
  }

  return Response.json({ success: true, classId }, { status: 201 });
}
