import { db } from '@/src/db';
import { users, sessions, evaluations } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { cacheGet, cacheSet, cacheKeys, TTL } from '@/lib/cache';
import { computeCompositeScore } from '@/lib/roleplay/phase-engine';
import { and, eq, desc, isNull, sql } from 'drizzle-orm';

interface LeaderboardRow {
  userId: string;
  name: string;
  level: string | null;
  xp: number;
  streak: number;
  sessionsCompleted: number;
  averageScore: number;
}

/** Per-dimension averages; null when the learner has no evaluations yet. */
const avgOf = (column: string) => sql<number | null>`(
  select avg(${sql.raw(`"${column}"`)}) from ${evaluations}
  where ${eq(evaluations.userId, users.id)}
)`;

async function loadLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      level: users.level,
      xp: users.xp,
      streak: users.streak,
      sessionsCompleted: sql<number>`coalesce((
        select count(*) from ${sessions}
        where ${eq(sessions.userId, users.id)} and ${eq(sessions.status, 'completed')}
      ), 0)::int`,
      vocabulary: avgOf('vocabulary_score'),
      grammar: avgOf('grammar_score'),
      fluency: avgOf('fluency_score'),
      cultural: avgOf('cultural_score'),
      task: avgOf('task_score'),
      expression: avgOf('expression_appropriateness_score'),
    })
    .from(users)
    // Learners only, and only live accounts: tutors and admins are not
    // competing, and a suspended or deleted account must not keep its rank.
    .where(and(eq(users.role, 'learner'), eq(users.status, 'active'), isNull(users.deletedAt)))
    .orderBy(desc(users.xp))
    .limit(20);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    level: r.level,
    xp: r.xp,
    streak: r.streak,
    sessionsCompleted: Number(r.sessionsCompleted),
    // The same weighted composite every other score in the app uses. The
    // weights are linear, so the composite of the averages equals the average
    // of the composites. The old flat (5 scores)/5 disagreed with the session
    // report and ignored expression appropriateness entirely.
    averageScore: r.vocabulary == null ? 0 : computeCompositeScore('completed', {
      vocabularyScore: Number(r.vocabulary),
      grammarScore: Number(r.grammar),
      fluencyScore: Number(r.fluency),
      culturalScore: Number(r.cultural),
      taskScore: Number(r.task),
      expressionAppropriatenessScore: Number(r.expression),
    }),
  }));
}

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // The ranking is the same for everyone, so it is cached once; only
  // `isCurrentUser` is per-viewer and is applied after the cache.
  let leaderboard = await cacheGet<LeaderboardRow[]>(cacheKeys.leaderboard());
  if (!leaderboard) {
    leaderboard = await loadLeaderboard();
    await cacheSet(cacheKeys.leaderboard(), leaderboard, TTL.LEADERBOARD);
  }

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
