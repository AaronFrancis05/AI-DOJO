import { db } from '@/src/db';
import { users, sessions, evaluations } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { eq, desc, sql, and } from 'drizzle-orm';

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const leaderboard = await db
    .select({
      userId: users.id,
      name: users.name,
      level: users.level,
      xp: users.xp,
      streak: users.streak,
      sessionsCompleted: sql<number>`coalesce((
        select count(*) from ${sessions}
        where ${eq(sessions.userId, users.id)} and ${eq(sessions.status, 'completed')}
      ), 0)`,
      averageScore: sql<number>`coalesce((
        select round(avg(("vocabulary_score" + "grammar_score" + "fluency_score" + "cultural_score" + "task_score") / 5.0))
        from ${evaluations}
        where ${eq(evaluations.userId, users.id)}
      ), 0)`,
    })
    .from(users)
    .orderBy(desc(users.xp))
    .limit(20);

  return Response.json({
    success: true,
    leaderboard: leaderboard.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: r.name,
      level: r.level ?? 'beginner',
      xp: r.xp,
      sessionsCompleted: r.sessionsCompleted,
      averageScore: r.averageScore,
      streak: r.streak,
      isCurrentUser: r.userId === authUser.id,
    })),
  });
}
