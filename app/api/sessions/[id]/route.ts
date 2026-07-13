import { db } from '../../../../src/db';
import { sessions, scenarios, conversations, corrections, evaluations, goalCompletions, scenarioGoals, vocabulary, situations, domains, characters } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq, asc } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId));

  let situation = null;
  let domain = null;
  let character = null;

  if (session.situationId) {
    const [s] = await db.select().from(situations).where(eq(situations.id, session.situationId));
    situation = s;
    if (s) {
      const [d] = await db.select().from(domains).where(eq(domains.id, s.domainId));
      domain = d;
    }
  }

  if (session.characterId) {
    const [c] = await db.select().from(characters).where(eq(characters.id, session.characterId));
    character = c;
  }

  const vocabItems = scenario ? await db
    .select()
    .from(vocabulary)
    .where(eq(vocabulary.scenarioId, scenario.id)) : [];

  const goals = scenario ? await db
    .select()
    .from(scenarioGoals)
    .where(eq(scenarioGoals.scenarioId, scenario.id))
    .orderBy(asc(scenarioGoals.sequenceOrder)) : [];

  const conversationList = await db
    .select()
    .from(conversations)
    .where(eq(conversations.sessionId, sessionId))
    .orderBy(asc(conversations.turnNo));

  const conversationWithCorrections = await Promise.all(
    conversationList.map(async (conv) => {
      const corrs = await db
        .select()
        .from(corrections)
        .where(eq(corrections.conversationId, conv.id));
      return { ...conv, corrections: corrs };
    })
  );

  const [evaluation] = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.sessionId, sessionId));

  const goalCompletionList = await db
    .select({
      id: goalCompletions.id,
      conversationId: goalCompletions.conversationId,
      scenarioGoalId: goalCompletions.scenarioGoalId,
      achieved: goalCompletions.achieved,
      evidenceNote: goalCompletions.evidenceNote,
      goalText: scenarioGoals.goalText,
      goalType: scenarioGoals.goalType,
      sequenceOrder: scenarioGoals.sequenceOrder,
    })
    .from(goalCompletions)
    .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
    .where(eq(goalCompletions.sessionId, sessionId));

  return Response.json({
    success: true,
    session,
    scenario: scenario ?? null,
    situation,
    domain,
    character,
    vocabulary: vocabItems,
    goals,
    conversations: conversationWithCorrections,
    evaluation: evaluation ?? null,
    goalCompletions: goalCompletionList,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));

  return Response.json({ success: true, message: 'Session deleted' });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { status } = body;

  if (!status || !['active', 'paused', 'completed'].includes(status)) {
    return Response.json({ error: 'Invalid status value' }, { status: 400 });
  }

  const updateData: Record<string, any> = { status };

  if (status === 'completed') {
    updateData.completedAt = new Date();
  }

  await db.update(sessions).set(updateData).where(eq(sessions.id, sessionId));

  return Response.json({ success: true, message: `Session ${status}` });
}

