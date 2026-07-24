import { db } from '../../../../../../src/db';
import { sessions, conversations, corrections, evaluations, scenarioGoals, users, scenarios } from '../../../../../../src/schema';
import { verifyExportApiKey } from '../../../../../../lib/exportAuth';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  if (!verifyExportApiKey(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { scenarioId } = await params;
  const numericScenarioId = Number(scenarioId);
  if (isNaN(numericScenarioId)) {
    return Response.json({ error: 'Invalid scenario ID' }, { status: 400 });
  }

  const url = new URL(req.url);
  const includeIncomplete = url.searchParams.get('includeIncomplete') === 'true';

  const [currentScenario] = await db.select().from(scenarios).where(eq(scenarios.id, numericScenarioId));

  if (!currentScenario) {
    return Response.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const goals = await db
    .select({
      sequenceOrder: scenarioGoals.sequenceOrder,
      goalText: scenarioGoals.goalText,
      goalType: scenarioGoals.goalType,
      targetPhrase: scenarioGoals.targetPhrase,
    })
    .from(scenarioGoals)
    .where(eq(scenarioGoals.scenarioId, numericScenarioId))
    .orderBy(asc(scenarioGoals.sequenceOrder));

  const conditions = [
    eq(sessions.scenarioId, numericScenarioId),
    eq(users.consentToDataSharing, true),
  ];

  if (!includeIncomplete) {
    conditions.push(eq(sessions.status, 'completed'));
  }

  const sessionRows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      sessionNumber: sessions.sessionNumber,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(...conditions));

  const sessionData = await Promise.all(
    sessionRows.map(async (sRow) => {
      const convRows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.sessionId, sRow.id))
        .orderBy(asc(conversations.turnNo));

      const conversation = await Promise.all(
        convRows.map(async (conv) => {
          const corrs = await db
            .select()
            .from(corrections)
            .where(eq(corrections.conversationId, conv.id));

          const entry: any = {
            turnNo: conv.turnNo,
            speaker: conv.speaker,
            messageTarget: conv.messageTarget,
            messageNative: conv.messageNative,
            messageRomaji: conv.messageRomaji,
          };

          if (conv.emotionTone) entry.emotionTone = conv.emotionTone;
          if (conv.gestureHint) entry.gestureHint = conv.gestureHint;

          if (conv.speaker === 'user' && corrs.length > 0) {
            entry.corrections = corrs.map(c => ({
              correctionType: c.correctionType,
              originalText: c.originalText,
              correctedText: c.correctedText,
              explanation: c.explanation,
              severity: c.severity,
            }));
          }

          return entry;
        })
      );

      const [evalRow] = await db
        .select()
        .from(evaluations)
        .where(eq(evaluations.sessionId, sRow.id));

      return {
        sessionId: sRow.id,
        sessionNumber: sRow.sessionNumber,
        conversation,
        evaluation: evalRow ? {
          vocabulary: evalRow.vocabularyScore,
          grammar: evalRow.grammarScore,
          fluency: evalRow.fluencyScore,
          cultural: evalRow.culturalScore,
          task: evalRow.taskScore,
        } : null,
      };
    })
  );

  return Response.json({
    scenarioId: numericScenarioId,
    scenarioTitle: currentScenario.title,
    context: currentScenario.context,
    aiCharacterName: currentScenario.aiCharacterName,
    goals,
    sessions: sessionData,
  });
}
