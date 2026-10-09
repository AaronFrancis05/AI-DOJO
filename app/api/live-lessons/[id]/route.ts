import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db';
import { liveLessons } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadLiveLessonForUser, loadLiveLessonRoster } from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { createNotifications } from '@/lib/notifications';
import { announceLive } from '@/lib/tutors/live';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';
import { learnerMayUseTutor } from '@/lib/organizations/tutor-access';

export const runtime = 'nodejs';

const LIVE_LESSON_STATUSES = ['scheduled', 'live', 'completed', 'cancelled'] as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId)) {
    return Response.json({ error: 'Invalid live lesson id' }, { status: 400 });
  }

  const found = await loadLiveLessonForUser(lessonId, user.id);
  if (!found) return Response.json({ error: 'Live lesson not found' }, { status: 404 });

  const seated = found.enrollment != null && found.enrollment.status !== 'cancelled';
  if (!found.isTutor && !seated && !(await learnerMayUseTutor(user.id, found.liveLesson.tutorId))) {
    return Response.json({ error: 'Live lesson not found' }, { status: 404 });
  }

  const roster = await loadLiveLessonRoster(lessonId);
  const decision = canJoinBooking({
    scheduledAt: found.liveLesson.scheduledAt,
    durationMinutes: found.liveLesson.durationMinutes,
    status: found.liveLesson.status,
  });

  return Response.json({
    success: true,
    liveLesson: {
      id: found.liveLesson.id,
      title: found.liveLesson.title,
      description: found.liveLesson.description,
      tutorName: found.tutorName,
      courseId: found.liveLesson.courseId,
      unitId: found.liveLesson.unitId,
      targetLanguage: found.liveLesson.targetLanguage,
      scheduledAt: found.liveLesson.scheduledAt,
      durationMinutes: found.liveLesson.durationMinutes,
      capacity: found.liveLesson.capacity,
      status: found.liveLesson.status,
      chatRoomId: found.liveLesson.chatRoomId,
      isTutor: found.isTutor,
      myEnrollmentStatus: found.enrollment?.status ?? null,
      canJoin: decision.allowed,
      joinBlockedReason: decision.allowed ? null : decision.reason,
    },
    // The roster is a list of who else is in the room — shown to the tutor as
    // a register, and to learners as the people they will be talking to.
    roster: roster.map((r) => ({
      learnerId: r.learnerId,
      name: r.name,
      avatarSrc: r.avatarSrc,
      nativeLanguage: r.nativeLanguage,
      status: r.status,
    })),
  });
}

/** Tutor-only status changes: go live, wrap up, cancel. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId)) {
    return Response.json({ error: 'Invalid live lesson id' }, { status: 400 });
  }

  const found = await loadLiveLessonForUser(lessonId, user.id);
  // 404 rather than 403 for a learner: the same reason loadBookingForUser
  // collapses "not found" and "not yours".
  if (!found || !found.isTutor) {
    return Response.json({ error: 'Live lesson not found' }, { status: 404 });
  }

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const status = String(body.status ?? '');
  if (!(LIVE_LESSON_STATUSES as readonly string[]).includes(status)) {
    return Response.json({ error: 'Unsupported status' }, { status: 400 });
  }

  // The status write is unconditional: a tutor may re-open a room they had
  // dropped back to 'scheduled', and that must still take effect.
  await db
    .update(liveLessons)
    .set({ status, updatedAt: new Date() })
    .where(eq(liveLessons.id, lessonId));

  // Claiming the first open is separate, and conditional in SQL rather than on
  // the row we read above. Deciding it from that read is a check-then-act: two
  // PATCHes racing would both see a null `wentLiveAt` and both announce. The
  // `IS NULL` predicate makes exactly one of them win, and only the winner
  // gets a row back.
  let isFirstOpen = false;
  if (status === 'live') {
    const claimed = await db
      .update(liveLessons)
      .set({ wentLiveAt: new Date() })
      .where(and(eq(liveLessons.id, lessonId), isNull(liveLessons.wentLiveAt)))
      .returning({ id: liveLessons.id });
    isFirstOpen = claimed.length > 0;
  }

  await publish(topics.liveLesson(lessonId), { type: 'lesson.updated', lessonId });

  if (isFirstOpen) {
    // The roster is unioned with the cohort rather than replacing it: someone
    // who enrolled in this one live lesson may not be one of this tutor's learners
    // by any other route, and they are the last person who should miss it.
    const roster = await loadLiveLessonRoster(lessonId);
    await announceLive({
      kind: 'live_lesson',
      tutorId: found.liveLesson.tutorId,
      tutorName: found.tutorName ?? 'Your tutor',
      title: found.liveLesson.title,
      courseId: found.liveLesson.courseId,
      targetLanguage: found.liveLesson.targetLanguage,
      href: `/live/lesson/${lessonId}`,
      extraLearnerIds: roster.map((r) => r.learnerId),
    });
  }

  // A cancellation is the one status change a learner must be told about
  // rather than discover by turning up.
  if (status === 'cancelled') {
    const roster = await loadLiveLessonRoster(lessonId);
    await createNotifications(roster.map((r) => r.learnerId), {
      type: 'live_lesson',
      title: 'A live lesson was cancelled',
      body: `${found.liveLesson.title} on ${found.liveLesson.scheduledAt.toLocaleString()} will not run.`,
      href: '/tutors',
    });
  }

  return Response.json({ success: true });
}
