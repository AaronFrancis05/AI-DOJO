import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { assessmentSessions } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadAssessmentForUser } from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { tutorLanguageError } from '@/lib/tutors/languages';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';
import {
  DEFAULT_INTERVIEWER_AVATAR_ID,
  interviewerPersona,
  isKnownInterviewerAvatarId,
} from '@/lib/interview/persona';

export const runtime = 'nodejs';

const ASSESSMENT_STATUSES = ['scheduled', 'live', 'completed', 'cancelled'] as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = Number((await params).id);
  if (!Number.isInteger(assessmentId)) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const found = await loadAssessmentForUser(assessmentId, user.id);
  if (!found) return Response.json({ error: 'Assessment not found' }, { status: 404 });

  const decision = canJoinBooking({
    scheduledAt: found.assessment.scheduledAt,
    durationMinutes: found.assessment.durationMinutes,
    status: found.assessment.status,
  });

  return Response.json({
    success: true,
    assessment: {
      id: found.assessment.id,
      title: found.assessment.title,
      description: found.assessment.description,
      tutorName: found.tutorName,
      courseId: found.assessment.courseId,
      unitId: found.assessment.unitId,
      targetLanguage: found.assessment.targetLanguage,
      scheduledAt: found.assessment.scheduledAt,
      durationMinutes: found.assessment.durationMinutes,
      minutesPerLearner: found.assessment.minutesPerLearner,
      status: found.assessment.status,
      examiner: found.assessment.examiner,
      // The persona is resolved here rather than in the client so the room
      // and the locked prompt cannot disagree about who the examiner is.
      interviewer:
        found.assessment.examiner === 'ai'
          ? interviewerPersona(found.assessment.aiInterviewerAvatarId)
          : null,
      // The brief is the examiner's instructions and a learner must not read
      // it — knowing what will be probed is knowing the paper in advance.
      aiInterviewerAvatarId: found.isTutor ? found.assessment.aiInterviewerAvatarId : null,
      aiInterviewerBrief: found.isTutor ? found.assessment.aiInterviewerBrief : null,
      isTutor: found.isTutor,
      myQueueState: found.slot?.state ?? null,
      canJoin: decision.allowed,
      joinBlockedReason: decision.allowed ? null : decision.reason,
    },
  });
}

/**
 * Tutor-only edits: the room's status, and who examines.
 *
 * Handing a room to the AI examiner is a PATCH rather than something fixed at
 * creation because of when the decision actually gets made — a tutor schedules
 * an assessment intending to run it, and finds out later that they cannot.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = Number((await params).id);
  if (!Number.isInteger(assessmentId)) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const found = await loadAssessmentForUser(assessmentId, user.id);
  if (!found || !found.isTutor) {
    return Response.json({ error: 'Assessment not found' }, { status: 404 });
  }

  let body: {
    status?: unknown;
    examiner?: unknown;
    instructionLanguage?: unknown;
    aiInterviewerAvatarId?: unknown;
    aiInterviewerBrief?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Partial<typeof assessmentSessions.$inferInsert> = { updatedAt: new Date() };

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!(ASSESSMENT_STATUSES as readonly string[]).includes(status)) {
      return Response.json({ error: 'Unsupported status' }, { status: 400 });
    }
    patch.status = status;
  }

  if (body.examiner !== undefined) {
    const examiner = String(body.examiner);
    if (examiner !== 'tutor' && examiner !== 'ai') {
      return Response.json({ error: 'Unsupported examiner' }, { status: 400 });
    }
    patch.examiner = examiner;
    if (examiner === 'ai' && !found.assessment.aiInterviewerAvatarId) {
      patch.aiInterviewerAvatarId = DEFAULT_INTERVIEWER_AVATAR_ID;
    }
  }

  // Editable after creation for the same reason `examiner` is: a tutor handing
  // the room to the AI examiner may also be handing it to a different cohort,
  // and the brief is built from this at token time.
  if (body.instructionLanguage !== undefined) {
    const code = body.instructionLanguage ? String(body.instructionLanguage).trim() : null;
    const languageError = tutorLanguageError(
      found.tutor,
      found.assessment.targetLanguage,
      code,
    );
    if (languageError) return Response.json({ error: languageError }, { status: 400 });
    patch.instructionLanguage = code;
  }

  if (body.aiInterviewerAvatarId !== undefined) {
    const avatarId = String(body.aiInterviewerAvatarId);
    if (!isKnownInterviewerAvatarId(avatarId)) {
      return Response.json({ error: 'Unknown interviewer' }, { status: 400 });
    }
    patch.aiInterviewerAvatarId = avatarId;
  }

  if (body.aiInterviewerBrief !== undefined) {
    patch.aiInterviewerBrief = body.aiInterviewerBrief
      ? String(body.aiInterviewerBrief).slice(0, 2000)
      : null;
  }

  if (Object.keys(patch).length === 1) {
    return Response.json({ error: 'Nothing to change' }, { status: 400 });
  }

  await db
    .update(assessmentSessions)
    .set(patch)
    .where(eq(assessmentSessions.id, assessmentId));

  // `assessment.status` is the event both rooms already listen on, and a
  // change of examiner re-renders the same page for the same reason a change
  // of status does. `status` carries the current value either way.
  await publish(topics.assessment(assessmentId), {
    type: 'assessment.status',
    assessmentId,
    status: patch.status ?? found.assessment.status,
  });

  return Response.json({ success: true });
}
