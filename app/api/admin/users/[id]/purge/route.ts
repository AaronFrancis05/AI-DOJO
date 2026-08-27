import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';

export const runtime = 'nodejs';

/**
 * Permanently removes an account and everything that cascades from it.
 *
 * The irreversible counterpart of `DELETE /api/admin/users` (which soft-deletes
 * and keeps the foreign keys intact). This exists for a genuine erasure
 * request, and nothing else should use it: `users.id` cascades into sessions,
 * conversations, evaluations, class enrolments, chat messages, queue slots and
 * tutor verdicts, so a purge rewrites other people's records too — a tutor's
 * roster loses a learner retroactively, and grades filed against them vanish.
 *
 * Guarded three ways, because "delete the user" is a very easy button to press
 * by accident:
 *
 * 1. The caller must be an admin.
 * 2. `confirmEmail` in the body must match the row's email exactly, so the
 *    console can require it typed out.
 * 3. An admin cannot purge themselves.
 *
 * The response names what was removed, so the action is auditable from the
 * caller's side even though nothing survives in the database to audit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let actor;
  try {
    actor = await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const userId = (await params).id;
  if (!userId) return Response.json({ error: 'Invalid user id' }, { status: 400 });
  if (userId === actor.user.id) {
    return Response.json({ error: 'You cannot purge your own account' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const confirmEmail =
    body && typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';

  const [existing] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) return Response.json({ error: 'User not found' }, { status: 404 });

  if (!confirmEmail || confirmEmail !== existing.email.toLowerCase()) {
    return Response.json(
      { error: 'Type the account email exactly to confirm this permanent deletion.' },
      { status: 400 },
    );
  }

  // Counted before the delete, because after it there is nothing left to count.
  // These are the tables a purge visibly empties for other people.
  const [counts] = await db
    .select({
      sessions: sql<number>`(select count(*)::int from sessions where user_id = ${userId})`,
      classEnrollments: sql<number>`(select count(*)::int from class_enrollments where learner_id = ${userId})`,
      tutorEvaluations: sql<number>`(select count(*)::int from tutor_evaluations where learner_id = ${userId})`,
      chatMessages: sql<number>`(select count(*)::int from chat_messages where sender_id = ${userId})`,
    })
    .from(users)
    .where(eq(users.id, userId));

  await db.delete(users).where(eq(users.id, userId));

  return Response.json({
    success: true,
    purged: {
      email: existing.email,
      name: existing.name,
      // What went with them. `chat_messages.sender_id` is ON DELETE SET NULL,
      // so those messages survive as authorless rather than disappearing.
      sessions: Number(counts?.sessions ?? 0),
      classEnrollments: Number(counts?.classEnrollments ?? 0),
      tutorEvaluations: Number(counts?.tutorEvaluations ?? 0),
      chatMessagesOrphaned: Number(counts?.chatMessages ?? 0),
    },
  });
}
