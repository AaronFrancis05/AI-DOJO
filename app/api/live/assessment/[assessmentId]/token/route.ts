import { getAuthUser } from '@/lib/auth/server';
import { loadAssessmentForUser } from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { buildJoinPayload } from '@/lib/tutors/join';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

/**
 * Mints a Stream call token for one assessment room.
 *
 * The rule that makes this an examination rather than a class lives here: a
 * learner gets a token only while their queue slot is `admitted`. Enforcing
 * it in the UI would mean a learner who knew the endpoint could sit in on
 * someone else's exam, so the queue state is checked at the only point that
 * matters — the moment access is granted.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = Number((await params).assessmentId);
  if (!Number.isInteger(assessmentId)) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const found = await loadAssessmentForUser(assessmentId, user.id);
  if (!found) return Response.json({ error: 'Assessment not found' }, { status: 404 });

  // An AI-examined assessment has no video room: there is no second human in
  // it, so the media path is browser ↔ Gemini Live and an SFU would carry
  // audio between two endpoints that never needed it relayed. Refused here
  // rather than silently minting a token for a call nobody will join.
  if (found.assessment.examiner === 'ai') {
    return Response.json(
      { error: 'This assessment is run by the AI examiner — there is no video room.' },
      { status: 409 },
    );
  }

  if (!found.isTutor) {
    if (!found.slot) {
      return Response.json({ error: 'Join the queue first.' }, { status: 403 });
    }
    if (found.slot.state === 'done') {
      return Response.json({ error: 'Your assessment is finished.' }, { status: 403 });
    }
    if (found.slot.state !== 'admitted') {
      return Response.json({ error: 'It is not your turn yet.' }, { status: 403 });
    }
  }

  const decision = canJoinBooking({
    scheduledAt: found.assessment.scheduledAt,
    durationMinutes: found.assessment.durationMinutes,
    status: found.assessment.status,
  });
  if (!decision.allowed) {
    return Response.json({ error: decision.reason }, { status: 403 });
  }

  const payload = await buildJoinPayload({
    callId: found.assessment.callId,
    callType: found.assessment.callType,
    user: { id: user.id, name: user.name },
    ownerUserId: found.tutorUserId,
    ownerName: found.tutorName,
    isTutor: found.isTutor,
  });
  if (payload instanceof Response) return payload;

  return Response.json(payload);
}
