import { db } from '../../../src/db';
import { sessions, scenarios, evaluations } from '../../../src/schema';
import { getAuthUser } from '../../../lib/auth';
import { eq, and, count, desc } from 'drizzle-orm';

export async function GET(req: Request) {
  const auth = getAuthUser(req);
  if (!auth) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const scenarioIdFilter = url.searchParams.get('scenarioId');
  const statusFilter = url.searchParams.get('status');

  const conditions = [eq(sessions.userId, auth.userId)];
  if (scenarioIdFilter) conditions.push(eq(sessions.scenarioId, Number(scenarioIdFilter)));
  if (statusFilter) conditions.push(eq(sessions.status, statusFilter));

  const list = await db
    .select({
      id: sessions.id,
      scenarioId: sessions.scenarioId,
      scenarioTitle: scenarios.title,
      scenarioDomain: scenarios.domain,
      sessionNumber: sessions.sessionNumber,
      status: sessions.status,
      totalTurns: sessions.totalTurns,
      vocabularyScore: sessions.vocabularyScore,
      grammarScore: sessions.grammarScore,
      fluencyScore: sessions.fluencyScore,
      culturalScore: sessions.culturalScore,
      taskScore: sessions.taskScore,
      feedback: sessions.feedback,
      startedAt: sessions.startedAt,
      completedAt: sessions.completedAt,
    })
    .from(sessions)
    .innerJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.startedAt));

  return Response.json({ success: true, sessions: list });
}

export async function POST(req: Request) {
  const auth = getAuthUser(req);
  if (!auth) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { scenarioId } = await req.json();

  if (!scenarioId) {
    return Response.json({ error: 'scenarioId is required' }, { status: 400 });
  }

  const numericScenarioId = Number(scenarioId);
  if (isNaN(numericScenarioId)) {
    return Response.json({ error: 'Invalid scenarioId' }, { status: 400 });
  }

  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, numericScenarioId));
  if (!scenario) {
    return Response.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const [result] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.userId, auth.userId), eq(sessions.scenarioId, numericScenarioId)));

  const sessionNumber = (result?.count ?? 0) + 1;

  const [session] = await db.insert(sessions).values({
    userId: auth.userId,
    scenarioId: numericScenarioId,
    sessionNumber,
    status: 'active',
  }).returning();

  return Response.json({ success: true, session }, { status: 201 });
}
