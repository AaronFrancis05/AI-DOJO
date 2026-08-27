import { db } from '@/src/db';
import { users } from '@/src/schema';
import { desc, ilike, or, sql } from 'drizzle-orm';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { isUserRole } from '@/lib/auth/roles';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

/** The user list behind the admin console, newest first, optionally searched. */
export async function GET(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number(url.searchParams.get('limit')) || PAGE_SIZE));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  const where = query
    ? or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`))
    : undefined;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
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

/** Promotes or demotes one account. The only way to mint the first admin. */
export async function PATCH(req: Request) {
  let actor;
  try {
    actor = await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  const { userId, role } = (body ?? {}) as { userId?: unknown; role?: unknown };

  if (typeof userId !== 'string' || !userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }
  if (!isUserRole(role)) {
    return Response.json({ error: 'Unknown role' }, { status: 400 });
  }
  // An admin demoting themselves can lock the last admin out of the console
  // with no way back in short of a SQL prompt.
  if (userId === actor.user.id && role !== 'admin') {
    return Response.json({ error: 'You cannot remove your own admin role' }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set({ role })
    .where(sql`${users.id} = ${userId}`)
    .returning({ id: users.id, role: users.role });

  if (!updated) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  return Response.json({ success: true, user: updated });
}
