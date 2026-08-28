import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { assessmentQueue, tutorEvaluations } from '@/src/schema';
import { getAuthUser, requireRole, roleErrorResponse } from '@/lib/auth/server';
import { loadAssessmentForUser } from '@/lib/tutors/rooms-data';
import { normalizeScores } from '@/lib/ai-engine';
import { createNotification } from '@/lib/notifications';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

const AGREEMENT_VALUES = ['agrees', 'too_generous', 'too_harsh'] as const;

/**
 * The tutor's verdict on one learner examined in an assessment room.
 *
 * The same `tutor_evaluations` table and the same six 0-100 dimensions the
 * booking flow writes, anchored to the learner's queue slot instead of a
 * booking — see the table's comment in src/schema.ts for why that is a
 * nullable pair rather than a synthetic booking row.
 */
export async function POST(
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
  // Running this assessment is not the same as still being authorised to
  // teach: a rejected application leaves the `tutors` row and only drops
  // `users.role`. Both checks, not either — matching the booking route.
  try {
    await requireRole('tutor');
  } catch (err) {
    return roleErrorResponse(err);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const learnerId = typeof body.learnerId === 'string' ? body.learnerId : null;
  if (!learnerId) {
    return Response.json({ error: 'learnerId is required' }, { status: 400 });
  }

  // Grading is scoped to this assessment's own queue, so a tutor cannot post
  // a verdict against a learner who was never examined by them.
  const [slot] = await db
    .select()
    .from(assessmentQueue)
    .where(and(
      eq(assessmentQueue.assessmentId, assessmentId),
      eq(assessmentQueue.learnerId, learnerId),
    ))
    .limit(1);
  if (!slot) {
    return Response.json({ error: 'That learner is not in this assessment' }, { status: 404 });
  }

  const agreesWithAi = AGREEMENT_VALUES.includes(body.agreesWithAi as typeof AGREEMENT_VALUES[number])
    ? String(body.agreesWithAi)
    : null;

  // Reuses the AI pipeline's own clamp so a hand-typed 150 cannot reach the
  // score columns and skew a comparison against the AI's evaluation.
  const scores = normalizeScores(body.scores);

  const values = {
    assessmentQueueId: slot.id,
    bookingId: null,
    tutorId: found.assessment.tutorId,
    learnerId,
    // An assessment examines a learner, not one recorded AI session, so there
    // is no session to hang it off. The /grades page compares against the
    // learner's AI evaluations for the course instead.
    sessionId: null,
    vocabularyScore: scores.vocabulary,
    grammarScore: scores.grammar,
    fluencyScore: scores.fluency,
    culturalScore: scores.cultural,
    taskScore: scores.task,
    expressionAppropriatenessScore: scores.expressionAppropriateness,
    agreesWithAi,
    notes: body.notes ? String(body.notes).slice(0, 5000) : null,
  };

  const [saved] = await db
    .insert(tutorEvaluations)
    .values(values)
    .onConflictDoUpdate({ target: tutorEvaluations.assessmentQueueId, set: values })
    .returning();

  await createNotification({
    userId: learnerId,
    type: 'evaluation',
    title: `${found.tutorName ?? 'Your tutor'} graded your assessment`,
    body: values.notes ? values.notes.slice(0, 200) : null,
    href: '/progress',
  });

  return Response.json({ success: true, evaluation: saved }, { status: 201 });
}
