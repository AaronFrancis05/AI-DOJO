import { db } from '@/src/db';
import { users, sessions } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { eq, count, and } from 'drizzle-orm';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const [dbUser] = await db
    .select({
      name: users.name,
      email: users.email,
      level: users.level,
      xp: users.xp,
      xpToNext: users.xpToNext,
      tier: users.tier,
      streak: users.streak,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [[{ total }], [{ completed }]] = await Promise.all([
    db.select({ total: count() }).from(sessions).where(eq(sessions.userId, user.id)),
    db.select({ completed: count() }).from(sessions).where(and(eq(sessions.userId, user.id), eq(sessions.status, 'completed'))),
  ]);

  return Response.json({
    success: true,
    stats: {
      ...dbUser,
      totalSessions: total ?? 0,
      completedSessions: completed ?? 0,
    },
  });
}
