import { eq, and } from 'drizzle-orm';
import { db } from '@/src/db';
import { liveLessonEnrollments } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { enrolLearner, loadLiveLessonForUser } from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { buildJoinPayload } from '@/lib/tutors/join';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';

export const runtime = 'nodejs';

/**
 * Mints a Stream call token for one live lesson.
 *
 * Same security boundary as /api/live/token: the join window is verified here,
 * on the server, before a token exists. Attendance is recorded on the same
 * pass — the moment a token is issued is the only moment the server knows for
 * certain that someone turned up.
 *
 * Enrolment is not a precondition but a consequence: a learner who has a seat
 * keeps it, and one who does not takes one on the way in, up to capacity.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const lessonId = Number((await params).lessonId);
  if (!Number.isInteger(lessonId)) {
    return Response.json({ error: 'Invalid live lesson id' }, { status: 400 });
  }

  const found = await loadLiveLessonForUser(lessonId, user.id);
  if (!found) return Response.json({ error: 'Live lesson not found' }, { status: 404 });

  const decision = canJoinBooking({
    scheduledAt: found.liveLesson.scheduledAt,
    durationMinutes: found.liveLesson.durationMinutes,
    status: found.liveLesson.status,
  });
  if (!decision.allowed) {
    return Response.json({ error: decision.reason }, { status: 403 });
  }

  // A learner arriving without a seat takes one here rather than being turned
  // away. An instant live lesson has no roster by definition — the tutor opened it
  // and their cohort was notified — so demanding a prior enrolment would make
  // the notification a dead end. Capacity is still the same rule under the same
  // advisory lock; this is the enrol route's transaction, not a second one.
  //
  // Ordered after the window check on purpose: a live lesson that has not opened, or
  // is over, should not quietly gain members.
  if (!found.isTutor) {
    if (!found.enrollment || found.enrollment.status === 'cancelled') {
      const enrolled = await enrolLearner(lessonId, user.id, found.liveLesson);
      if (!enrolled.ok) {
        return Response.json({ error: enrolled.reason }, { status: 403 });
      }
      // The same event the enrol route publishes, for the same reason: a seat
      // taken here is a seat taken, and the tutor's open register and the
      // live-lesson lists have no other way to learn about it.
      await publish(topics.liveLesson(lessonId), { type: 'lesson.updated', lessonId });
    }
  }

  const payload = await buildJoinPayload({
    callId: found.liveLesson.callId,
    callType: found.liveLesson.callType,
    user: { id: user.id, name: user.name },
    ownerUserId: found.tutorUserId,
    ownerName: found.tutorName,
    isTutor: found.isTutor,
  });
  if (payload instanceof Response) return payload;

  if (!found.isTutor) {
    await db
      .update(liveLessonEnrollments)
      .set({ status: 'attended', attendedAt: new Date() })
      .where(and(
        eq(liveLessonEnrollments.liveLessonId, lessonId),
        eq(liveLessonEnrollments.learnerId, user.id),
      ));
  }

  return Response.json(payload);
}
