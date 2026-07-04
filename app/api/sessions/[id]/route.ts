import { db } from '../../../../src/db';
import { sessions, conversations, corrections, evaluations, goalCompletions, scenarioGoals, vocabularyEncounters, vocabulary } from '../../../../src/schema';
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
