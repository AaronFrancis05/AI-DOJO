import { db } from '@/src/db';
import { tutorEvaluations, evaluations } from '@/src/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, requireRole, roleErrorResponse } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { normalizeScores } from '@/lib/ai-engine';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';

const AGREEMENT_VALUES = ['agrees', 'too_generous', 'too_harsh'] as const;

/**
 * The tutor's verdict, plus the AI's own scores for the same session when the
 * booking was tied to one — so the UI can put the two side by side, which is
 * the entire point of an evaluation booking.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) {
    return Response.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });

  const [tutorEval] = await db
    .select()
    .from(tutorEvaluations)
    .where(eq(tutorEvaluations.bookingId, bookingId));

  const aiEval = found.booking.sessionId
    ? (await db.select().from(evaluations).where(eq(evaluations.sessionId, found.booking.sessionId)))[0] ?? null
    : null;

  return Response.json({
    success: true,
    tutorEvaluation: tutorEval ?? null,
    aiEvaluation: aiEval,
    canSubmit: found.isTutor,
  });
}

/**
 * Records (or replaces) the tutor's evaluation for a booking.
 *
 * Scores use the SAME independent 0-100 dimensions the AI grades on, so the
 * human and machine verdicts are directly comparable rather than needing a
 * conversion nobody would remember to apply.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) {
    return Response.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });
  if (!found.isTutor) {
    return Response.json({ error: 'Only the tutor can submit an evaluation' }, { status: 403 });
  }
  // Being the booking's tutor is not the same as still being authorised to
  // teach: a rejected application leaves the `tutors` row in place and only
  // drops `users.role`. Both checks, not either.
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

  const agreesWithAi = AGREEMENT_VALUES.includes(body.agreesWithAi as typeof AGREEMENT_VALUES[number])
    ? String(body.agreesWithAi)
    : null;

  // Reuses the AI pipeline's own clamp so a hand-typed 150 can't reach the
  // score columns and skew a comparison against the AI's evaluation.
  const scores = normalizeScores(body.scores);

  const values = {
    bookingId,
    tutorId: found.booking.tutorId,
    learnerId: found.booking.learnerId,
    sessionId: found.booking.sessionId,
    vocabularyScore: scores.vocabulary,
    grammarScore: scores.grammar,
    fluencyScore: scores.fluency,
    culturalScore: scores.cultural,
    taskScore: scores.task,
    expressionAppropriatenessScore: scores.expressionAppropriateness,
    agreesWithAi,
    notes: body.notes ? String(body.notes).slice(0, 5000) : null,
  };

  // A tutor revising their write-up should update the existing verdict rather
  // than fail on the unique bookingId constraint.
  const [saved] = await db
    .insert(tutorEvaluations)
    .values(values)
    .onConflictDoUpdate({ target: tutorEvaluations.bookingId, set: values })
    .returning();

  // A grade nobody is told about is a grade nobody reads. Fires on revisions
  // too: a changed verdict is exactly the kind of thing worth re-announcing.
  await createNotification({
    userId: found.booking.learnerId,
    type: 'evaluation',
    title: `${found.tutorName ?? 'Your tutor'} graded your session`,
    body: values.notes ? String(values.notes).slice(0, 200) : null,
    href: '/progress',
  });

  return Response.json({ success: true, evaluation: saved }, { status: 201 });
}
