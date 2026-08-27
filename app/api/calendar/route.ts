import { and, asc, eq, gte, isNotNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  assessmentQueue,
  assessmentSessions,
  calendarTasks,
  classEnrollments,
  classSessions,
  courseLevels,
  courses,
  lessons,
  scenarios,
  sessions,
  tutorBookings,
  tutors,
  units,
  users,
} from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

interface CalendarItem {
  id: string;
  kind: 'task' | 'lesson_reminder' | 'session' | 'booking' | 'class' | 'assessment';
  title: string;
  subtitle?: string;
  at: string;
  allDay?: boolean;
  status?: string;
  href?: string;
  completed?: boolean;
}

/**
 * The learner/tutor calendar, aggregated from every table that already
 * carries a date rather than a copy of them: `calendar_tasks` (to-dos and the
 * post-onboarding lesson-plan reminders — the one thing with no other home),
 * practice `sessions`, and — when tutoring is enabled — `tutor_bookings`,
 * `class_sessions`/`class_enrollments`, and
 * `assessment_sessions`/`assessment_queue`. A caller with a `tutors` row gets
 * their teaching schedule folded in alongside their learner-side items, so
 * one endpoint serves both `/calendar` roles.
 *
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` bounds the window; defaults to a year-wide
 * span around today, generous enough for a month grid's overflow days
 * without the client having to special-case the default.
 */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const now = new Date();
  const from = fromParam ? new Date(fromParam) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = toParam ? new Date(toParam) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0, 23, 59, 59, 999));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return Response.json({ error: 'from/to must be valid dates' }, { status: 400 });
  }

  const [tutorProfile] = await db
    .select({ id: tutors.id })
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);

  const tasksQuery = db
    .select({
      task: calendarTasks,
      courseSlug: courses.slug,
    })
    .from(calendarTasks)
    .leftJoin(lessons, eq(calendarTasks.sourceLessonId, lessons.id))
    .leftJoin(units, eq(lessons.unitId, units.id))
    .leftJoin(courseLevels, eq(units.levelId, courseLevels.id))
    .leftJoin(courses, eq(courseLevels.courseId, courses.id))
    .where(and(
      eq(calendarTasks.userId, user.id),
      gte(calendarTasks.dueAt, from),
      lte(calendarTasks.dueAt, to),
    ))
    .orderBy(asc(calendarTasks.dueAt));

  const sessionsQuery = db
    .select({
      id: sessions.id,
      startedAt: sessions.startedAt,
      status: sessions.status,
      scenarioTitle: scenarios.title,
    })
    .from(sessions)
    .leftJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
    .where(and(
      eq(sessions.userId, user.id),
      gte(sessions.startedAt, from),
      lte(sessions.startedAt, to),
    ))
    .orderBy(asc(sessions.startedAt));

  const [taskRows, sessionRows] = await Promise.all([tasksQuery, sessionsQuery]);

  const items: CalendarItem[] = [];

  for (const { task, courseSlug } of taskRows) {
    items.push({
      id: `${task.kind}-${task.id}`,
      kind: task.kind === 'lesson_reminder' ? 'lesson_reminder' : 'task',
      title: task.title,
      at: task.dueAt.toISOString(),
      allDay: task.allDay,
      status: task.status,
      completed: task.status === 'done',
      href: task.kind === 'lesson_reminder' && courseSlug && task.sourceLessonId
        ? `/courses/${courseSlug}#lesson-${task.sourceLessonId}`
        : undefined,
    });
  }

  for (const s of sessionRows) {
    items.push({
      id: `session-${s.id}`,
      kind: 'session',
      title: s.scenarioTitle ?? 'Practice Session',
      subtitle: s.status,
      at: s.startedAt.toISOString(),
      status: s.status,
      href: `/sessions/${s.id}`,
    });
  }

  if (TUTORS_ENABLED) {
    const bookingsQuery = db
      .select({
        booking: tutorBookings,
        tutorName: users.name,
      })
      .from(tutorBookings)
      .innerJoin(tutors, eq(tutorBookings.tutorId, tutors.id))
      .innerJoin(users, eq(tutors.userId, users.id))
      .where(and(
        tutorProfile
          ? or(eq(tutorBookings.learnerId, user.id), eq(tutorBookings.tutorId, tutorProfile.id))
          : eq(tutorBookings.learnerId, user.id),
        ne(tutorBookings.status, 'cancelled'),
        gte(tutorBookings.scheduledAt, from),
        lte(tutorBookings.scheduledAt, to),
      ))
      .orderBy(asc(tutorBookings.scheduledAt));

    // "My" enrolment / queue slot comes from a LEFT JOIN narrowed to this
    // user, not a correlated subquery. Both are at most one row per parent
    // (uq_class_enrollment, uq_assessment_queue_learner), and the join keeps
    // the query readable — but the real reason is that Drizzle only qualifies
    // column names once a query has a join. In a join-less query a subquery
    // written as `where class_session_id = id` emits `id` unqualified, which
    // Postgres resolves against the SUBQUERY's own table, so the correlation
    // silently never matches.
    const classesQuery = db
      .select({
        classSession: classSessions,
        myEnrollmentStatus: classEnrollments.status,
      })
      .from(classSessions)
      .leftJoin(classEnrollments, and(
        eq(classEnrollments.classSessionId, classSessions.id),
        eq(classEnrollments.learnerId, user.id),
        ne(classEnrollments.status, 'cancelled'),
      ))
      .where(and(
        ne(classSessions.status, 'cancelled'),
        gte(classSessions.scheduledAt, from),
        lte(classSessions.scheduledAt, to),
        tutorProfile
          ? or(eq(classSessions.tutorId, tutorProfile.id), isNotNull(classEnrollments.id))
          : isNotNull(classEnrollments.id),
      ))
      .orderBy(asc(classSessions.scheduledAt));

    const assessmentsQuery = db
      .select({
        assessment: assessmentSessions,
        myState: assessmentQueue.state,
      })
      .from(assessmentSessions)
      .leftJoin(assessmentQueue, and(
        eq(assessmentQueue.assessmentId, assessmentSessions.id),
        eq(assessmentQueue.learnerId, user.id),
      ))
      .where(and(
        ne(assessmentSessions.status, 'cancelled'),
        gte(assessmentSessions.scheduledAt, from),
        lte(assessmentSessions.scheduledAt, to),
        tutorProfile
          ? or(eq(assessmentSessions.tutorId, tutorProfile.id), isNotNull(assessmentQueue.id))
          : isNotNull(assessmentQueue.id),
      ))
      .orderBy(asc(assessmentSessions.scheduledAt));

    const [bookingRows, classRows, assessmentRows] = await Promise.all([
      bookingsQuery,
      classesQuery,
      assessmentsQuery,
    ]);

    for (const { booking, tutorName } of bookingRows) {
      const isTutor = Boolean(tutorProfile && booking.tutorId === tutorProfile.id);
      items.push({
        id: `booking-${booking.id}`,
        kind: 'booking',
        title: isTutor
          ? `One-to-one${booking.purpose === 'evaluation' ? ' · Evaluation' : ''}`
          : `Lesson with ${tutorName}`,
        subtitle: `${booking.durationMinutes} min`,
        at: booking.scheduledAt.toISOString(),
        status: booking.status,
        href: `/live/${booking.id}`,
      });
    }

    for (const { classSession, myEnrollmentStatus } of classRows) {
      // A row reaches here either because the caller teaches it or because
      // they are enrolled — so no enrolment means they are the tutor.
      items.push({
        id: `class-${classSession.id}`,
        kind: 'class',
        title: classSession.title,
        subtitle: `${classSession.durationMinutes} min · ${
          myEnrollmentStatus === 'attended' ? 'Attended'
            : myEnrollmentStatus ? 'Enrolled'
            : 'Teaching'
        }`,
        at: classSession.scheduledAt.toISOString(),
        status: classSession.status,
        href: `/live/class/${classSession.id}`,
      });
    }

    for (const { assessment, myState } of assessmentRows) {
      const mine = myState === 'waiting' ? 'In the queue'
        : myState === 'admitted' ? 'Your turn'
        : myState === 'done' ? 'Completed'
        : null;
      items.push({
        id: `assessment-${assessment.id}`,
        kind: 'assessment',
        title: assessment.title,
        subtitle: mine ?? (assessment.examiner === 'ai' ? 'AI examiner' : 'Examining'),
        at: assessment.scheduledAt.toISOString(),
        status: assessment.status,
        href: `/live/assessment/${assessment.id}`,
      });
    }
  }

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return Response.json({ success: true, items });
}
