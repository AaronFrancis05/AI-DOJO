import { db } from '../../../../src/db';
import { shareTokens, sessions, conversations, corrections, evaluations, scenarioGoals, goalCompletions, scenarios } from '../../../../src/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return Response.json({ error: 'Missing token' }, { status: 400 });
  }

  const [shareRecord] = await db.select().from(shareTokens).where(eq(shareTokens.token, token));
  if (!shareRecord) {
    return Response.json({ error: 'Invalid or expired share link' }, { status: 404 });
  }

  const { sessionId } = shareRecord;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId));
  if (!scenario) {
    return Response.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const conversationRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.sessionId, sessionId))
    .orderBy(asc(conversations.turnNo));

  const conversationWithCorrections = await Promise.all(
    conversationRows.map(async (conv) => {
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
      goalText: scenarioGoals.goalText,
      goalType: scenarioGoals.goalType,
      sequenceOrder: scenarioGoals.sequenceOrder,
    })
    .from(goalCompletions)
    .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
    .where(eq(goalCompletions.sessionId, sessionId));

  return Response.json({
    success: true,
    readOnly: true,
    session: {
      id: session.id,
      sessionNumber: session.sessionNumber,
      status: session.status,
      totalTurns: session.totalTurns,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    scenario: {
      title: scenario.title,
      context: scenario.context,
      difficulty: scenario.difficulty,
      domain: scenario.domain,
      aiCharacterName: scenario.aiCharacterName,
      aiCharacterRole: scenario.aiCharacterRole,
      userCharacterName: scenario.userCharacterName,
      userCharacterRole: scenario.userCharacterRole,
    },
    conversations: conversationWithCorrections,
    evaluation: evaluation ?? null,
    goalCompletions: goalCompletionList,
  });
}
