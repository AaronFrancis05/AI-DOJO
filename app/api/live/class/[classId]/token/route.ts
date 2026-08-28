import { eq, and } from 'drizzle-orm';
import { db } from '@/src/db';
import { classEnrollments } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadClassForUser } from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { buildJoinPayload } from '@/lib/tutors/join';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

/**
 * Mints a Stream call token for one group class.
 *
 * Same security boundary as /api/live/token: enrolment and the join window
 * are verified here, on the server, before a token exists. Attendance is
 * recorded on the same pass — the moment a token is issued is the only
 * moment the server knows for certain that someone turned up.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const classId = Number((await params).classId);
  if (!Number.isInteger(classId)) {
    return Response.json({ error: 'Invalid class id' }, { status: 400 });
  }

  const found = await loadClassForUser(classId, user.id);
  if (!found) return Response.json({ error: 'Class not found' }, { status: 404 });

  if (!found.isTutor) {
    if (!found.enrollment || found.enrollment.status === 'cancelled') {
      return Response.json({ error: 'You are not enrolled in this class.' }, { status: 403 });
    }
  }

  const decision = canJoinBooking({
    scheduledAt: found.classSession.scheduledAt,
    durationMinutes: found.classSession.durationMinutes,
    status: found.classSession.status,
  });
  if (!decision.allowed) {
    return Response.json({ error: decision.reason }, { status: 403 });
  }

  const payload = await buildJoinPayload({
    callId: found.classSession.callId,
    callType: found.classSession.callType,
    user: { id: user.id, name: user.name },
    ownerUserId: found.tutorUserId,
    ownerName: found.tutorName,
    isTutor: found.isTutor,
  });
  if (payload instanceof Response) return payload;

  if (!found.isTutor) {
    await db
      .update(classEnrollments)
      .set({ status: 'attended', attendedAt: new Date() })
      .where(and(
        eq(classEnrollments.classSessionId, classId),
        eq(classEnrollments.learnerId, user.id),
      ));
  }

  return Response.json(payload);
}
