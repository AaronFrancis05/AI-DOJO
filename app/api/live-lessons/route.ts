import { and, asc, desc, eq, gte, or, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  chatRoomMembers,
  chatRooms,
  liveLessonEnrollments,
  liveLessons,
  tutors,
  units,
  users,
} from '@/src/schema';
import { getAuthUser, requireRole, roleErrorResponse } from '@/lib/auth/server';
import { generateCallId } from '@/lib/tutors/rooms';
import {
  LIVE_LESSON_DURATIONS_MINUTES,
  DEFAULT_CALL_TYPE,
  MAX_LIVE_LESSON_CAPACITY,
  TUTORS_ENABLED,
} from '@/lib/tutors/config';
import { dbPool } from '@/src/db-pool';
import { tutorLanguageError } from '@/lib/tutors/languages';
import { announceLive } from '@/lib/tutors/live';
import { resolveRoomAnchor } from '@/lib/courses/room-anchor';
import { loadTutorAccess, mayDiscoverWithAccess } from '@/lib/organizations/tutor-access';

export const runtime = 'nodejs';

/**
 * Scheduled live lessons.
 *
 * GET is deliberately broad — a learner browsing what is on, a tutor looking
 * at their own schedule, and the course page asking "is there a live lesson
 * for this unit?" are the same query with different filters:
 *
 *   ?mine=1      only live lessons I teach or am enrolled in
 *   ?unitId=N    only live lessons pinned to that course unit
 *   ?past=1      include live lessons that have already finished
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

  const conditions = [sql`${liveLessons.status} <> 'cancelled'`];
  if (unitId != null && Number.isInteger(unitId)) {
    conditions.push(eq(liveLessons.unitId, unitId));
  }
  if (!includePast) {
    // A live lesson stays listed for an hour past its start so someone running late
    // can still find it — unless it is actually live, in which case it stays
    // listed for as long as it is. A 90-minute live lesson vanishing from the page
    // at the hour mark, while the tutor is still in the room, is the one case
    // a fixed cutoff gets exactly backwards.
    conditions.push(or(
      eq(liveLessons.status, 'live'),
      gte(liveLessons.scheduledAt, new Date(Date.now() - 60 * 60 * 1000)),
    )!);
  }

  const rows = await db
    .select({
      liveLesson: liveLessons,
      tutorName: users.name,
      tutorAvatar: users.avatarSrc,
      unitTitle: units.title,
      enrolledCount: sql<number>`(
        select count(*)::int from ${liveLessonEnrollments}
        where ${liveLessonEnrollments.liveLessonId} = ${liveLessons.id}
          and ${liveLessonEnrollments.status} <> 'cancelled'
      )`,
      myEnrollmentStatus: sql<string | null>`(
        select ${liveLessonEnrollments.status} from ${liveLessonEnrollments}
        where ${liveLessonEnrollments.liveLessonId} = ${liveLessons.id}
          and ${liveLessonEnrollments.learnerId} = ${user.id}
        limit 1
      )`,
      verificationStatus: tutors.verificationStatus,
      isAcceptingBookings: tutors.isAcceptingBookings,
      accountStatus: users.status,
    })
    .from(liveLessons)
    .innerJoin(tutors, eq(liveLessons.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .leftJoin(units, eq(liveLessons.unitId, units.id))
    .where(and(...conditions))
    .orderBy(includePast ? desc(liveLessons.scheduledAt) : asc(liveLessons.scheduledAt))
    .limit(100);

  const access = await loadTutorAccess(user.id);
  const visible = (mine
    ? rows.filter(
        (r) =>
          (tutorProfile && r.liveLesson.tutorId === tutorProfile.id) ||
          r.myEnrollmentStatus != null,
      )
    : rows
  ).filter((r) => {
    const teaching = Boolean(tutorProfile && r.liveLesson.tutorId === tutorProfile.id);
    const seated = r.myEnrollmentStatus != null && r.myEnrollmentStatus !== 'cancelled';
    const bookable = r.verificationStatus === 'verified' && r.isAcceptingBookings && r.accountStatus === 'active';
    return mayDiscoverWithAccess(access, r.liveLesson.tutorId, bookable, teaching || seated);
  });

  return Response.json({
    success: true,
    liveLessons: visible.map((r) => ({
      id: r.liveLesson.id,
      title: r.liveLesson.title,
      description: r.liveLesson.description,
      tutorId: r.liveLesson.tutorId,
      tutorName: r.tutorName,
      tutorAvatarSrc: r.tutorAvatar,
      courseId: r.liveLesson.courseId,
      unitId: r.liveLesson.unitId,
      unitTitle: r.unitTitle,
      targetLanguage: r.liveLesson.targetLanguage,
      instructionLanguage: r.liveLesson.instructionLanguage,
      scheduledAt: r.liveLesson.scheduledAt,
      durationMinutes: r.liveLesson.durationMinutes,
      capacity: r.liveLesson.capacity,
      enrolledCount: Number(r.enrolledCount),
      status: r.liveLesson.status,
      myEnrollmentStatus: r.myEnrollmentStatus,
      // The call id is never listed. It is handed out only alongside a token
      // from /api/live/lesson/[lessonId]/token, after the checks there pass.
      isTutor: Boolean(tutorProfile && r.liveLesson.tutorId === tutorProfile.id),
    })),
  });
}

/** Creates a live lesson. Tutors only — a learner cannot schedule teaching. */
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
  if (!(LIVE_LESSON_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
    return Response.json({ error: 'Unsupported duration' }, { status: 400 });
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_LIVE_LESSON_CAPACITY) {
    return Response.json(
      { error: `Capacity must be between 1 and ${MAX_LIVE_LESSON_CAPACITY}` },
      { status: 400 },
    );
  }

  // The live lesson and its chat room are one unit of work, for the same reason a
  // booking and its room are: a live lesson whose chat room failed to create would
  // have a sidebar nobody can post in.
  const lessonId = await dbPool.transaction(async (tx) => {
    const [room] = await tx
      .insert(chatRooms)
      .values({
        name: title.slice(0, 150),
        isGroup: true,
        kind: 'live_lesson',
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
      .insert(liveLessons)
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
      .returning({ id: liveLessons.id });

    return created?.id ?? null;
  });

  // After the transaction, never inside it: the announcement is a courtesy on
  // top of a live lesson that already exists, and a slow fan-out must not hold a
  // write lock open. A scheduled live lesson announces itself later, when the tutor
  // PATCHes it live.
  if (startNow && lessonId != null) {
    await announceLive({
      kind: 'live_lesson',
      tutorId: tutorProfile.id,
      tutorName: user.name ?? 'Your tutor',
      title,
      courseId: anchor.courseId,
      targetLanguage,
      href: `/live/lesson/${lessonId}`,
    });
  }

  return Response.json({ success: true, lessonId }, { status: 201 });
}
