import { db } from '@/src/db';
import { users, sessions, evaluations } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { eq, desc, sql, and } from 'drizzle-orm';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      level: users.level,
      xp: users.xp,
      streak: users.streak,
    })
    .from(users)
    .orderBy(desc(users.xp))
    .limit(20);

  const leaderboard = await Promise.all(
    rows.map(async (r, i) => {
      const [sessionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(sessions)
        .where(and(eq(sessions.userId, r.userId), eq(sessions.status, 'completed')));

      const [avgScore] = await db
        .select({ avg: sql<number>`coalesce(avg(("vocabulary_score" + "grammar_score" + "fluency_score" + "cultural_score" + "task_score") / 5.0), 0)` })
        .from(evaluations)
        .where(eq(evaluations.userId, r.userId));

      return {
        rank: i + 1,
        userId: r.userId,
        name: r.name,
        level: r.level ?? 'beginner',
        xp: r.xp,
        sessionsCompleted: sessionCount?.count ?? 0,
        averageScore: Math.round(avgScore?.avg ?? 0),
        streak: r.streak,
        isCurrentUser: r.userId === user.id,
      };
    }),
  );

  return Response.json({ success: true, leaderboard });
}
