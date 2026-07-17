import { db } from '../../../src/db';
import { sessions, conversations, corrections, evaluations, scenarioGoals, goalCompletions, scenarios, situations, users } from '../../../src/schema';
import { analyzeAndGenerateTurn } from '../../../lib/ai-engine';
import { getTargetLangConfig } from '../../../lib/language';
import { eq, and, asc } from 'drizzle-orm';
import { getAuthUser } from '../../../lib/auth/server';

const SAFETY_CAP_TURN = 15;

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, userRawInput } = body;

    if (!sessionId || !userRawInput) {
      return Response.json({ error: 'sessionId and userRawInput are required' }, { status: 400 });
    }

    const numericSessionId = Number(sessionId);
    if (isNaN(numericSessionId)) {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, numericSessionId));
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userId !== user.id) {
      return Response.json({ error: 'Forbidden - this session does not belong to you' }, { status: 403 });
    }

    if (session.status !== 'active') {
      return Response.json({ error: 'Session is already completed' }, { status: 400 });
    }

    const { scenarioId } = session;
    const behaviorMode = session.behaviorMode ?? 'standard';
    const targetLanguage = session.targetLanguage ?? 'ja';
    const nativeLanguage = session.nativeLanguage ?? 'en';

    const [currentScenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));

    if (!currentScenario) {
      return Response.json({ error: 'Scenario not found' }, { status: 404 });
    }

    let situationContext = currentScenario.context;
    let situationLearningGoals = currentScenario.learningGoals;

    if (session.situationId) {
      const [situation] = await db
        .select()
        .from(situations)
        .where(eq(situations.id, session.situationId));
      if (situation) {
        situationContext = situation.context;
        situationLearningGoals = situation.learningGoals;
      }
    }

    const goals = await db
      .select()
      .from(scenarioGoals)
      .where(eq(scenarioGoals.scenarioId, scenarioId))
      .orderBy(asc(scenarioGoals.sequenceOrder));

    const existingCompletions = await db
      .select({ seqOrder: scenarioGoals.sequenceOrder })
      .from(goalCompletions)
      .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
      .where(and(eq(goalCompletions.sessionId, numericSessionId), eq(scenarioGoals.scenarioId, scenarioId)));

    const completedSequenceOrders = existingCompletions.map(c => c.seqOrder);

    const conversationRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, numericSessionId))
      .orderBy(asc(conversations.turnNo));

    const currentTurnNo = conversationRows.length > 0
      ? Math.max(...conversationRows.map(c => c.turnNo)) + 1
      : 1;

    const conversationHistory = conversationRows.map(row => ({
      role: row.speaker === 'ai' ? 'model' as const : 'user' as const,
      parts: [{ text: row.messageTarget ?? row.messageJp }]
    }));

    const mlPipelineOutput = await analyzeAndGenerateTurn(
      userRawInput,
      currentTurnNo,
      currentScenario,
      goals,
      completedSequenceOrders,
      conversationHistory,
      behaviorMode,
      situationContext,
      situationLearningGoals,
      targetLanguage,
      nativeLanguage,
    );

    const targetCfg = getTargetLangConfig(targetLanguage);
    const isJapanese = targetLanguage === 'ja';

    const [userConversation] = await db.insert(conversations).values({
      sessionId: numericSessionId,
      turnNo: currentTurnNo,
      speaker: 'user',
      messageTarget: mlPipelineOutput.messageTarget,
      messageNative: mlPipelineOutput.messageNative,
      messageJp: isJapanese ? mlPipelineOutput.messageTarget : (mlPipelineOutput.messageTarget ?? userRawInput),
      messageRomaji: mlPipelineOutput.messageRomaji,
      messageEn: mlPipelineOutput.messageNative,
      emotionTone: mlPipelineOutput.emotionTone ?? null,
      gestureHint: mlPipelineOutput.gestureHint ?? null,
      isEnglishWhenExpected: mlPipelineOutput.isEnglishWhenExpected,
      isValidInContext: mlPipelineOutput.isValidInContext,
    }).returning({ id: conversations.id });

    if (mlPipelineOutput.corrections && mlPipelineOutput.corrections.length > 0) {
      await db.insert(corrections).values(
        mlPipelineOutput.corrections.map(c => ({
          conversationId: userConversation.id,
          correctionType: c.correctionType,
          originalText: c.originalText,
          originalRomaji: c.originalRomaji ?? null,
          correctedText: c.correctedText,
          correctedRomaji: c.correctedRomaji ?? null,
          explanation: c.explanation,
          severity: c.severity,
        }))
      );
    }

    await db.insert(conversations).values({
      sessionId: numericSessionId,
      turnNo: currentTurnNo,
      speaker: 'ai',
      messageTarget: mlPipelineOutput.nextAiReply.target,
      messageNative: mlPipelineOutput.nextAiReply.native,
      messageJp: isJapanese ? mlPipelineOutput.nextAiReply.target : (mlPipelineOutput.nextAiReply.target ?? ''),
      messageRomaji: mlPipelineOutput.nextAiReply.romaji,
      messageEn: mlPipelineOutput.nextAiReply.native,
      emotionTone: mlPipelineOutput.nextAiReply.emotionTone ?? null,
      gestureHint: mlPipelineOutput.nextAiReply.gestureHint ?? null,
      isValidInContext: true,
    });

    if (mlPipelineOutput.goalsAddressedThisTurn?.length > 0) {
      const goalsMap = new Map(goals.map(g => [g.sequenceOrder, g.id]));
      const seen = new Set<number>();
      const completionRows = mlPipelineOutput.goalsAddressedThisTurn
        .filter(seqOrder => goalsMap.has(seqOrder))
        .filter(seqOrder => !completedSequenceOrders.includes(seqOrder))
        .filter(seqOrder => {
          if (seen.has(seqOrder)) return false;
          seen.add(seqOrder);
          return true;
        })
        .map(seqOrder => ({
          sessionId: numericSessionId,
          conversationId: userConversation.id,
          scenarioGoalId: goalsMap.get(seqOrder)!,
          achieved: true,
          evidenceNote: `Addressed in turn ${currentTurnNo}: "${userRawInput.substring(0, 80)}"`
        }));
      if (completionRows.length > 0) {
        await db.insert(goalCompletions).values(completionRows);
      }
    }

    const shouldComplete = mlPipelineOutput.scenarioComplete || currentTurnNo >= SAFETY_CAP_TURN;

    if (shouldComplete) {
      await db.update(sessions).set({
        status: 'completed',
        totalTurns: currentTurnNo,
        vocabularyScore: mlPipelineOutput.scores.vocabulary,
        grammarScore: mlPipelineOutput.scores.grammar,
        fluencyScore: mlPipelineOutput.scores.fluency,
        culturalScore: mlPipelineOutput.scores.cultural,
        taskScore: mlPipelineOutput.scores.task,
        feedback: mlPipelineOutput.feedback,
        completedAt: new Date(),
      }).where(eq(sessions.id, numericSessionId));

      await db.insert(evaluations).values({
        sessionId: numericSessionId,
        vocabularyScore: mlPipelineOutput.scores.vocabulary,
        grammarScore: mlPipelineOutput.scores.grammar,
        fluencyScore: mlPipelineOutput.scores.fluency,
        culturalScore: mlPipelineOutput.scores.cultural,
        taskScore: mlPipelineOutput.scores.task,
        feedback: mlPipelineOutput.feedback,
      });

      // XP & streak update
      const totalScore =
        mlPipelineOutput.scores.vocabulary +
        mlPipelineOutput.scores.grammar +
        mlPipelineOutput.scores.fluency +
        mlPipelineOutput.scores.cultural +
        mlPipelineOutput.scores.task;
      const xpGained = Math.round(totalScore * 2.5 + 25);

      const [userRow] = await db.select({
        xp: users.xp,
        streak: users.streak,
        lastActiveDate: users.lastActiveDate,
      }).from(users).where(eq(users.id, user.id));

      if (userRow) {
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        let newStreak = userRow.streak;
        if (userRow.lastActiveDate === today) {
          // same day, keep streak
        } else if (userRow.lastActiveDate === yesterday) {
          newStreak += 1;
        } else {
          newStreak = 1;
        }

        const newXp = userRow.xp + xpGained;
        let newLevel: string;
        let newXpToNext: number;
        if (newXp >= 6000) {
          newLevel = 'advanced';
          newXpToNext = 10000;
        } else if (newXp >= 2000) {
          newLevel = 'intermediate';
          newXpToNext = 6000;
        } else {
          newLevel = 'beginner';
          newXpToNext = 2000;
        }

        await db.update(users).set({
          xp: newXp,
          level: newLevel,
          xpToNext: newXpToNext,
          streak: newStreak,
          lastActiveDate: today,
        }).where(eq(users.id, user.id));
      }
    } else {
      await db.update(sessions).set({
        totalTurns: currentTurnNo,
      }).where(eq(sessions.id, numericSessionId));
    }

    return Response.json({
      success: true,
      analysis: {
        ...mlPipelineOutput,
        scenarioComplete: shouldComplete,
        scenarioUserRole: currentScenario.userCharacterRole,
        scenarioUserName: currentScenario.userCharacterName,
        aiCharacterName: currentScenario.aiCharacterName,
      }
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
