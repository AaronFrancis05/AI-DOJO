import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { isUserRole } from '@/lib/auth/roles';
import { isLanguageEnabled } from '@/lib/language-registry';
import { ACCOUNT_STATUSES, isAccountStatus } from '@/lib/auth/account-status';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

/** The user list behind the admin console, newest first, optionally filtered. */
export async function GET(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const role = url.searchParams.get('role')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(url.searchParams.get('limit')) || PAGE_SIZE));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  const conditions: SQL[] = [];
  if (query) {
    const match = or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`));
    if (match) conditions.push(match);
  }
  if (isUserRole(role)) conditions.push(eq(users.role, role));
  if (isAccountStatus(status)) conditions.push(eq(users.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      suspendedReason: users.suspendedReason,
      level: users.level,
      tier: users.tier,
      preferredTargetLanguage: users.preferredTargetLanguage,
      nativeLanguage: users.nativeLanguage,
      onboardingCompletedAt: users.onboardingCompletedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  return Response.json({ success: true, users: rows, total: count, limit, offset });
}

/**
 * Edits one account: role, profile fields, and access status.
 *
 * Partial — only the keys present are written — so the console can suspend
 * someone without round-tripping their whole profile.
 */
export async function PATCH(req: Request) {
  let actor;
  try {
    actor = await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { userId } = body as { userId?: unknown };
  if (typeof userId !== 'string' || !userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }

  const isSelf = userId === actor.user.id;
  const updates: Partial<typeof users.$inferInsert> = {};

  if (body.role !== undefined) {
    if (!isUserRole(body.role)) {
      return Response.json({ error: 'Unknown role' }, { status: 400 });
    }
    // An admin demoting themselves can lock the last admin out of the console
    // with no way back in short of a SQL prompt.
    if (isSelf && body.role !== 'admin') {
      return Response.json({ error: 'You cannot remove your own admin role' }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (body.status !== undefined) {
    if (!isAccountStatus(body.status)) {
      return Response.json(
        { error: `status must be one of ${ACCOUNT_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    // Same reasoning as the role guard: an admin who suspends themselves
    // cannot un-suspend themselves, because the console refuses them next load.
    if (isSelf && body.status !== 'active') {
      return Response.json({ error: 'You cannot suspend your own account' }, { status: 400 });
    }

    updates.status = body.status;
    updates.suspendedAt = body.status === 'suspended' ? new Date() : null;
    updates.suspendedReason =
      body.status === 'suspended' && typeof body.suspendedReason === 'string'
        ? body.suspendedReason.trim().slice(0, 500) || null
        : null;
    updates.deletedAt = body.status === 'deleted' ? new Date() : null;
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 100);
  }

  if (typeof body.level === 'string' && body.level.trim()) {
    updates.level = body.level.trim().slice(0, 20);
  }

  if (typeof body.tier === 'string' && body.tier.trim()) {
    updates.tier = body.tier.trim().slice(0, 20);
  }

  // Validated against the configured catalogue for the same reason the
  // learner's own preferences route is: an admin must not be able to park an
  // account on a language nothing can speak.
  if (typeof body.preferredTargetLanguage === 'string' && body.preferredTargetLanguage) {
    if (!(await isLanguageEnabled(body.preferredTargetLanguage, 'target'))) {
      return Response.json({ error: 'Unknown target language' }, { status: 400 });
    }
    updates.preferredTargetLanguage = body.preferredTargetLanguage;
  }

  if (typeof body.nativeLanguage === 'string' && body.nativeLanguage) {
    if (!(await isLanguageEnabled(body.nativeLanguage, 'native'))) {
      return Response.json({ error: 'Unknown native language' }, { status: 400 });
    }
    updates.nativeLanguage = body.nativeLanguage;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({ id: users.id, role: users.role, status: users.status });

  if (!updated) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  // A tutor whose account is suspended must also stop being bookable, or
  // learners keep finding them on /tutors and booking a room nobody can join.
  if (updates.status !== undefined) {
    await db
      .update(tutors)
      .set({ isAcceptingBookings: updates.status === 'active' })
      .where(eq(tutors.userId, userId));
  }

  return Response.json({ success: true, user: updated });
}

/**
 * Soft-deletes an account.
 *
 * Not a row delete: `users.id` is referenced by sessions, evaluations, class
 * rosters, chat messages and grades, so removing the row would rewrite other
 * people's history — a tutor's roster would lose a learner retroactively, and
 * `/courses/[slug]/grades` would lose the verdicts filed against them.
 *
 * The identity is anonymised so the account cannot be signed into or found,
 * while every foreign key stays intact. `/api/admin/users/[id]/purge` is the
 * irreversible version, for a genuine erasure request.
 */
export async function DELETE(req: Request) {
  let actor;
  try {
    actor = await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  const userId = (body ?? {}) && typeof body.userId === 'string' ? body.userId : '';
  if (!userId) return Response.json({ error: 'userId is required' }, { status: 400 });
  if (userId === actor.user.id) {
    return Response.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) return Response.json({ error: 'User not found' }, { status: 404 });

  // The email is uniquely indexed and is what syncUser() matches on, so it has
  // to be rewritten rather than cleared: leaving the real address in place
  // would let the same person sign up again straight into the closed account.
  await db
    .update(users)
    .set({
      status: 'deleted',
      deletedAt: new Date(),
      name: 'Deleted user',
      email: `deleted+${userId}@ai-dojo.invalid`,
      avatarSrc: null,
      passwordHash: null,
      googleId: null,
    })
    .where(eq(users.id, userId));

  await db.update(tutors).set({ isAcceptingBookings: false }).where(eq(tutors.userId, userId));

  return Response.json({ success: true, deletedEmail: existing.email });
}
