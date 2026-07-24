import { db } from '../../../../src/db';
import { sessions, scenarios, conversations, corrections, evaluations, goalCompletions, scenarioGoals, vocabulary, situations, domains, characters } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq, asc, inArray } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../../../../lib/cache';

type ScenarioRow = typeof scenarios.$inferSelect;
type SituationRow = typeof situations.$inferSelect;
type CharacterRow = typeof characters.$inferSelect;
type VocabRow = typeof vocabulary.$inferSelect;
type GoalRow = typeof scenarioGoals.$inferSelect;
type DomainRow = typeof domains.$inferSelect;

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
    scenario,
    situation,
    character,
    conversationList,
    evaluationResult,
    goalCompletionList,
  ] = await Promise.all([
    session.scenarioId
      ? (async (): Promise<ScenarioRow | null> => {
          const k = cacheKeys.scenario(session.scenarioId!);
          const c = await cacheGet<ScenarioRow | null>(k);
          if (c) return c;
          const r = await db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId!)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.SCENARIO);
          return r;
        })()
      : Promise.resolve(null),

    session.situationId
      ? (async (): Promise<SituationRow | null> => {
          const k = cacheKeys.situation(session.situationId!);
          const c = await cacheGet<SituationRow | null>(k);
          if (c) return c;
          const r = await db.select().from(situations).where(eq(situations.id, session.situationId!)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.SITUATION);
          return r;
        })()
      : Promise.resolve(null),

    session.characterId
      ? (async (): Promise<CharacterRow | null> => {
          const k = cacheKeys.character(session.characterId!);
          const c = await cacheGet<CharacterRow | null>(k);
          if (c) return c;
          const r = await db.select().from(characters).where(eq(characters.id, session.characterId!)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.CHARACTER);
          return r;
        })()
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

  const [vocabItems, goals, domainResult] = await Promise.all([
    scenario
      ? (async (): Promise<VocabRow[]> => {
          const k = cacheKeys.vocabulary(scenario.id);
          const c = await cacheGet<VocabRow[]>(k);
          if (c) return c;
          const r = await db.select().from(vocabulary).where(eq(vocabulary.scenarioId, scenario.id));
          await cacheSet(k, r, TTL.VOCABULARY);
          return r;
        })()
      : Promise.resolve([]),

    scenario
      ? (async (): Promise<GoalRow[]> => {
          const k = cacheKeys.goals(scenario.id);
          const c = await cacheGet<GoalRow[]>(k);
          if (c) return c;
          const r = await db.select().from(scenarioGoals).where(eq(scenarioGoals.scenarioId, scenario.id)).orderBy(asc(scenarioGoals.sequenceOrder));
          await cacheSet(k, r, TTL.GOALS);
          return r;
        })()
      : Promise.resolve([]),

    situation
      ? (async (): Promise<DomainRow | null> => {
          const k = cacheKeys.domain(situation.domainId);
          const c = await cacheGet<DomainRow | null>(k);
          if (c) return c;
          const r = await db.select().from(domains).where(eq(domains.id, situation.domainId)).then(r => r[0] ?? null);
          if (r) await cacheSet(k, r, TTL.DOMAIN);
          return r;
        })()
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
    situation,
    domain: domainResult,
    character,
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

  const updateData: Partial<typeof sessions.$inferInsert> = {};

  if (body.avatarEnabled !== undefined) {
    if (typeof body.avatarEnabled !== 'boolean') {
      return Response.json({ error: 'avatarEnabled must be a boolean' }, { status: 400 });
    }
    updateData.avatarEnabled = body.avatarEnabled;
  }

  if (status) {
    if (!['active', 'paused', 'completed'].includes(status)) {
      return Response.json({ error: 'Invalid status value' }, { status: 400 });
    }
    updateData.status = status;
    if (status === 'completed') {
      updateData.completedAt = new Date();
    } else if (status === 'active' || status === 'paused') {
      updateData.completedAt = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await db.update(sessions).set(updateData).where(eq(sessions.id, sessionId));

  return Response.json({ success: true });
}
