import { getAuthUser } from '@/lib/auth/server';
import {
  admitNext,
  finishCurrent,
  joinQueue,
  leaveQueue,
  loadAssessmentForUser,
  loadQueue,
} from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { createNotification } from '@/lib/notifications';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';

export const runtime = 'nodejs';

/**
 * The assessment queue.
 *
 * GET   the queue as this caller may see it
 * POST  a learner takes a place in line
 * PATCH the tutor admits the next learner (or a named one), or ends the turn
 * DELETE a learner withdraws
 *
 * Queue state is ours, not Stream's — who goes next is an academic decision,
 * not a media one — and every mutation ends in a publish so the waiting
 * learners' screens move without polling.
 */

async function resolve(params: Promise<{ id: string }>) {
  const assessmentId = Number((await params).id);
  return Number.isInteger(assessmentId) ? assessmentId : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = await resolve(params);
  if (assessmentId == null) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const found = await loadAssessmentForUser(assessmentId, user.id);
  if (!found) return Response.json({ error: 'Assessment not found' }, { status: 404 });

  const queue = await loadQueue(assessmentId);
  const waitingAhead = found.slot
    ? queue.filter((q) => q.state === 'waiting' && q.position < found.slot!.position).length
    : null;

  return Response.json({
    success: true,
    isTutor: found.isTutor,
    // The tutor needs names to admit by; a learner needs only their own place
    // in line, so that is all they are given.
    queue: found.isTutor
      ? queue.map((q) => ({
          id: q.id,
          learnerId: q.learnerId,
          name: q.name,
          avatarSrc: q.avatarSrc,
          position: q.position,
          state: q.state,
          admittedAt: q.admittedAt,
          completedAt: q.completedAt,
        }))
      : [],
    waitingCount: queue.filter((q) => q.state === 'waiting').length,
    admittedLearnerId: queue.find((q) => q.state === 'admitted')?.learnerId ?? null,
    me: found.slot
      ? {
          position: found.slot.position,
          state: found.slot.state,
          waitingAhead,
          // An estimate off the tutor's own per-learner budget, never a promise.
          estimatedWaitMinutes:
            waitingAhead == null ? null : waitingAhead * found.assessment.minutesPerLearner,
        }
      : null,
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = await resolve(params);
  if (assessmentId == null) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const found = await loadAssessmentForUser(assessmentId, user.id);
  if (!found) return Response.json({ error: 'Assessment not found' }, { status: 404 });
  if (found.isTutor) {
    return Response.json({ error: 'You are examining this session' }, { status: 400 });
  }

  // The same window that gates the room gates the queue: there is no point
  // standing in line for something that has not opened or has finished.
  const decision = canJoinBooking({
    scheduledAt: found.assessment.scheduledAt,
    durationMinutes: found.assessment.durationMinutes,
    status: found.assessment.status,
  });
  if (!decision.allowed) {
    return Response.json({ error: decision.reason }, { status: 403 });
  }

  const slot = await joinQueue(assessmentId, user.id);
  await publish(topics.assessment(assessmentId), { type: 'assessment.queue', assessmentId });

  return Response.json({ success: true, position: slot?.position ?? null }, { status: 201 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = await resolve(params);
  if (assessmentId == null) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const found = await loadAssessmentForUser(assessmentId, user.id);
  if (!found || !found.isTutor) {
    return Response.json({ error: 'Assessment not found' }, { status: 404 });
  }

  let body: { action?: unknown; learnerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Admitting is a rule about a shared room, and an AI-examined assessment
  // has no shared room — every learner gets their own private session and
  // they all run at once. `admitNext` would end another learner's interview
  // mid-answer, so neither action is offered here.
  if (found.assessment.examiner === 'ai') {
    return Response.json(
      { error: 'The AI examiner admits every learner at once — there is no queue to work.' },
      { status: 409 },
    );
  }

  const action = String(body.action ?? 'admit');

  if (action === 'finish') {
    await finishCurrent(assessmentId);
    await publish(topics.assessment(assessmentId), { type: 'assessment.queue', assessmentId });
    return Response.json({ success: true, admittedLearnerId: null });
  }

  if (action !== 'admit') {
    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  }

  const learnerId = typeof body.learnerId === 'string' ? body.learnerId : null;
  const result = await admitNext(assessmentId, learnerId);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 409 });
  }

  await publish(topics.assessment(assessmentId), { type: 'assessment.queue', assessmentId });

  if (result.admittedLearnerId) {
    // The admitted learner may have the tab in the background; the bell is
    // what gets them back to it.
    await createNotification({
      userId: result.admittedLearnerId,
      type: 'assessment',
      title: 'You are up next',
      body: `${found.tutorName} is ready for you in ${found.assessment.title}.`,
      href: `/live/assessment/${assessmentId}`,
    });
  }

  return Response.json({ success: true, admittedLearnerId: result.admittedLearnerId });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = await resolve(params);
  if (assessmentId == null) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const removed = await leaveQueue(assessmentId, user.id);
  if (removed) {
    await publish(topics.assessment(assessmentId), { type: 'assessment.queue', assessmentId });
  }

  return Response.json({ success: true });
}
