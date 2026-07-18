import { db } from '../../../../src/db';
import { sessions, scenarios, conversations, corrections, evaluations, goalCompletions, scenarioGoals, vocabulary, situations, domains, characters } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq, asc, inArray } from 'drizzle-orm';

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

  const [
    scenarioResult,
    situationResult,
    characterResult,
    conversationList,
    evaluationResult,
    goalCompletionList,
  ] = await Promise.all([
    session.scenarioId
      ? db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).then(r => r[0] ?? null)
      : Promise.resolve(null),

    session.situationId
      ? db.select().from(situations).where(eq(situations.id, session.situationId)).then(r => r[0] ?? null)
      : Promise.resolve(null),

    session.characterId
      ? db.select().from(characters).where(eq(characters.id, session.characterId)).then(r => r[0] ?? null)
      : Promise.resolve(null),

    db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))
      .orderBy(asc(conversations.turnNo)),

    db
      .select()
      .from(evaluations)
      .where(eq(evaluations.sessionId, sessionId))
      .then(r => r[0] ?? null),

    db
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
      .where(eq(goalCompletions.sessionId, sessionId)),
  ]);

  const scenario = scenarioResult;

  const [vocabItems, goals, domainResult] = await Promise.all([
    scenario
      ? db.select().from(vocabulary).where(eq(vocabulary.scenarioId, scenario.id))
      : Promise.resolve([]),

    scenario
      ? db.select().from(scenarioGoals).where(eq(scenarioGoals.scenarioId, scenario.id)).orderBy(asc(scenarioGoals.sequenceOrder))
      : Promise.resolve([]),

    situationResult
      ? db.select().from(domains).where(eq(domains.id, situationResult.domainId)).then(r => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const conversationIds = conversationList.map(c => c.id);
  const allCorrections = conversationIds.length > 0
    ? await db
        .select()
        .from(corrections)
        .where(inArray(corrections.conversationId, conversationIds))
    : [];

  const correctionsByConvId = new Map<number, typeof allCorrections>();
  for (const c of allCorrections) {
    const arr = correctionsByConvId.get(c.conversationId);
    if (arr) arr.push(c);
    else correctionsByConvId.set(c.conversationId, [c]);
  }

  const conversationWithCorrections = conversationList.map(conv => ({
    ...conv,
    corrections: correctionsByConvId.get(conv.id) ?? [],
  }));

  return Response.json({
    success: true,
    session,
    scenario: scenario ?? null,
    situation: situationResult,
    domain: domainResult,
    character: characterResult,
    vocabulary: vocabItems,
    goals,
    conversations: conversationWithCorrections,
    evaluation: evaluationResult,
    goalCompletions: goalCompletionList,
    avaturnSubdomain: process.env.NEXT_PUBLIC_AVATURN_SUBDOMAIN ?? null,
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
