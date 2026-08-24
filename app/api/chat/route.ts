import { db } from '../../../src/db';
import { dbPool, withSessionLock } from '../../../src/db-pool';
import { sessions, conversations, corrections, evaluations, scenarioGoals, goalCompletions, scenarios, situations, users, vocabularyEncounters, countries } from '../../../src/schema';
import { analyzeAndGenerateTurn } from '../../../lib/ai-engine';
import { AIProviderError, AIQuotaError, AIModelError } from '../../../lib/ai-providers';
import { buildConversationHistory } from '../../../lib/roleplay/conversation-history';
import { getTargetLangConfig } from '../../../lib/language';
import {
  nextPhase,
  computeCompositeScore,
  PRONUNCIATION_PASS_THRESHOLD,
  PASSING_SCORE_THRESHOLD,
  STALL_THRESHOLD,
  SAFETY_CAP_TURN,
  UNGUIDED_MISTAKE_PENALTY,
  UNGUIDED_ENGLISH_PENALTY,
} from '../../../lib/roleplay/phase-engine';
import { eq, and, asc, sql } from 'drizzle-orm';
import { getAuthUser } from '../../../lib/auth/server';
import { applySessionAvatarIdentity } from '../../../lib/avatar/catalog';

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, userRawInput, accuracyScore, isRetryOfPreviousMistake } = body;
    const responseTimeMs = typeof body.responseTimeMs === 'number' ? body.responseTimeMs : null;

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

    if (session.phase === 'icebreaker') {
      return Response.json({ error: 'Use the icebreaker endpoint during icebreaker phase' }, { status: 400 });
    }

    const { scenarioId } = session;
    const behaviorMode = session.behaviorMode ?? 'standard';
    const targetLanguage = session.targetLanguage ?? 'ja';
    const nativeLanguage = session.nativeLanguage ?? 'en';
    const currentPhase = session.phase as 'guided' | 'unguided' | 'evaluation' | 'completed';

    const [currentScenarioRow, conversationRows, goalsResult, completionsResult, situationResult, learnerProfile] = await Promise.all([
      db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).then(r => r[0] ?? null),

      db
        .select()
        .from(conversations)
        .where(eq(conversations.sessionId, numericSessionId))
        .orderBy(asc(conversations.turnNo)),

      db
        .select()
        .from(scenarioGoals)
        .where(eq(scenarioGoals.scenarioId, scenarioId))
        .orderBy(asc(scenarioGoals.sequenceOrder)),

      db
        .select({ seqOrder: scenarioGoals.sequenceOrder })
        .from(goalCompletions)
        .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
        .where(and(eq(goalCompletions.sessionId, numericSessionId), eq(scenarioGoals.scenarioId, scenarioId))),

      session.situationId
        ? db.select().from(situations).where(eq(situations.id, session.situationId)).then(r => r[0] ?? null)
        : Promise.resolve(null),

      db
        .select({ name: users.name, countryName: countries.name })
        .from(users)
        .leftJoin(countries, eq(users.countryCode, countries.code))
        .where(eq(users.id, session.userId))
        .then(r => r[0] ?? { name: '', countryName: null }),
    ]);

    if (!currentScenarioRow) {
      return Response.json({ error: 'Scenario not found' }, { status: 404 });
    }

    // The AI plays the avatar this session was created with; the shared
    // scenario row only carries whoever practised the situation first.
    const currentScenario = applySessionAvatarIdentity(currentScenarioRow, session.selectedAvatarId);

    const goals = goalsResult;
    const completedSequenceOrders = completionsResult.map(c => c.seqOrder);

    let situationContext = currentScenario.context;
    let situationLearningGoals = currentScenario.learningGoals;
    if (situationResult) {
      situationContext = situationResult.context;
      situationLearningGoals = situationResult.learningGoals;
    }

    const currentTurnNo = conversationRows.length > 0
      ? Math.max(...conversationRows.map(c => c.turnNo)) + 1
      : 1;

    const conversationHistory = buildConversationHistory(conversationRows);

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
      isRetryOfPreviousMistake,
      learnerProfile.name,
      learnerProfile.countryName,
    );

    const targetCfg = getTargetLangConfig(targetLanguage);
    const isJapanese = targetLanguage === 'ja';

    const hasCorrections = mlPipelineOutput.corrections && mlPipelineOutput.corrections.length > 0 && mlPipelineOutput.corrections.some(c => c.correctedText);

    // ── Wrap all writes in a transaction with session lock ──
    const writeResult = await withSessionLock(numericSessionId, async (tx) => {
      const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
      if (freshSession.status !== 'active') throw new Error('Session was completed by another request');

      const existingTurn = await tx.select({ id: conversations.id })
        .from(conversations)
        .where(and(
          eq(conversations.sessionId, numericSessionId),
          eq(conversations.turnNo, currentTurnNo)
        ))
        .limit(1);
      if (existingTurn.length > 0) throw new Error('Turn already processed by a concurrent request');

      const [userConversation] = await tx.insert(conversations).values({
        sessionId: numericSessionId,
        turnNo: currentTurnNo,
        speaker: 'user',
        messageTarget: mlPipelineOutput.messageTarget,
        messageNative: mlPipelineOutput.messageNative,
        messagePhonetic: mlPipelineOutput.messagePhonetic,
        emotionTone: mlPipelineOutput.emotionTone ?? null,
        gestureHint: mlPipelineOutput.gestureHint ?? null,
        isEnglishWhenExpected: mlPipelineOutput.isEnglishWhenExpected,
        isValidInContext: mlPipelineOutput.isValidInContext,
        responseTimeMs,
      }).returning({ id: conversations.id });

      // ── Guided phase: retry gate ──
      if (currentPhase === 'guided' && hasCorrections) {
        const prevPendingId = freshSession.pendingRetryCorrectionId;

        if (prevPendingId && isRetryOfPreviousMistake) {
          if (prevPendingId) {
            await tx.update(corrections).set({
              isFinalAttempt: true,
            }).where(eq(corrections.id, prevPendingId));
          }
          await tx.update(sessions).set({
            pendingRetryCorrectionId: null,
          }).where(eq(sessions.id, numericSessionId));
        } else if (!prevPendingId) {
          const validCorrections = mlPipelineOutput.corrections.filter(c => c.correctedText);
          if (validCorrections.length > 0) {
            const inserted = await tx.insert(corrections).values(
              validCorrections.map(c => ({
                conversationId: userConversation.id,
                correctionType: c.correctionType,
                originalText: c.originalText,
                originalPhonetic: c.originalPhonetic ?? null,
                correctedText: c.correctedText,
                correctedPhonetic: c.correctedPhonetic ?? null,
                explanation: c.explanation,
                severity: c.severity,
              }))
            ).returning({ id: corrections.id });

            const pendingRetryCorrectionId = inserted[0]?.id ?? null;
            if (pendingRetryCorrectionId) {
              await tx.update(sessions).set({
                pendingRetryCorrectionId,
              }).where(eq(sessions.id, numericSessionId));
            }
          }

          return { type: 'retry' as const, userConversationId: userConversation.id };
        }
      }

      // ── Insert corrections (non-guided or post-retry) ──
      if (hasCorrections) {
        const validCorrections = mlPipelineOutput.corrections.filter(c => c.correctedText);
        if (validCorrections.length > 0) {
          await tx.insert(corrections).values(
            validCorrections.map(c => ({
              conversationId: userConversation.id,
              correctionType: c.correctionType,
              originalText: c.originalText,
              originalPhonetic: c.originalPhonetic ?? null,
              correctedText: c.correctedText,
              correctedPhonetic: c.correctedPhonetic ?? null,
              explanation: c.explanation,
              severity: c.severity,
            }))
          );
        }
      }

      await tx.insert(conversations).values({
        sessionId: numericSessionId,
        turnNo: currentTurnNo,
        speaker: 'ai',
        messageTarget: mlPipelineOutput.nextAiReply.target,
        messageNative: mlPipelineOutput.nextAiReply.native,
        messagePhonetic: mlPipelineOutput.nextAiReply.phonetic,
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
          await tx.insert(goalCompletions).values(completionRows);
        }
      }

      let runningScore = freshSession.runningScore;
      if (currentPhase === 'unguided' && hasCorrections) {
        runningScore -= mlPipelineOutput.corrections.filter(c => c.correctedText).length * UNGUIDED_MISTAKE_PENALTY;
        if (mlPipelineOutput.isEnglishWhenExpected) {
          runningScore -= UNGUIDED_ENGLISH_PENALTY;
        }
        if (runningScore < 0) runningScore = 0;
      }

      const goalsCompleted = mlPipelineOutput.goalsAddressedThisTurn?.filter(
        seqOrder => !completedSequenceOrders.includes(seqOrder)
      ).length ?? 0;
      const newStalledTurnCount = goalsCompleted > 0 ? 0 : ((freshSession.stalledTurnCount ?? 0) + 1);
      const isStalled = (currentPhase === 'guided' || currentPhase === 'unguided')
        && newStalledTurnCount >= STALL_THRESHOLD;
      const isSafetyCapped = currentTurnNo >= SAFETY_CAP_TURN;
      const totalGoalsNow = completedSequenceOrders.length + goalsCompleted;
      const allGoalsCovered = isStalled || isSafetyCapped || totalGoalsNow >= goals.length;

      const newPhase = nextPhase(currentPhase, {
        icebreakerDone: false,
        allGoalsCovered,
      });
      const shouldComplete = mlPipelineOutput.scenarioComplete || (currentPhase === 'unguided' && (allGoalsCovered || isSafetyCapped));

      const currentVocabScore = freshSession.vocabularyScore ?? 0;
      const currentGrammarScore = freshSession.grammarScore ?? 0;
      const currentFluencyScore = freshSession.fluencyScore ?? 0;
      const currentCulturalScore = freshSession.culturalScore ?? 0;
      const currentTaskScore = freshSession.taskScore ?? 0;
      const currentExpressionScore = freshSession.expressionAppropriatenessScore ?? 0;

      const scoredTurnsCount = Math.max(1, Math.floor((conversationRows.filter(c => c.speaker === 'user').length) + 1));

      const blendedVocab = Math.round(((currentVocabScore * (scoredTurnsCount - 1)) + mlPipelineOutput.scores.vocabulary) / scoredTurnsCount);
      const blendedGrammar = Math.round(((currentGrammarScore * (scoredTurnsCount - 1)) + mlPipelineOutput.scores.grammar) / scoredTurnsCount);
      const blendedFluency = Math.round(((currentFluencyScore * (scoredTurnsCount - 1)) + mlPipelineOutput.scores.fluency) / scoredTurnsCount);
      const blendedCultural = Math.round(((currentCulturalScore * (scoredTurnsCount - 1)) + mlPipelineOutput.scores.cultural) / scoredTurnsCount);
      const blendedTask = Math.round(((currentTaskScore * (scoredTurnsCount - 1)) + mlPipelineOutput.scores.task) / scoredTurnsCount);
      const blendedExpression = Math.round(((currentExpressionScore * (scoredTurnsCount - 1)) + (mlPipelineOutput.scores as any).expressionAppropriateness) / scoredTurnsCount);

      const updateData: Record<string, any> = {
        totalTurns: currentTurnNo,
        runningScore,
        stalledTurnCount: newStalledTurnCount,
        lastActiveAt: new Date(),
        phase: shouldComplete ? 'completed' : newPhase,
        vocabularyScore: blendedVocab,
        grammarScore: blendedGrammar,
        fluencyScore: blendedFluency,
        culturalScore: blendedCultural,
        taskScore: blendedTask,
        expressionAppropriatenessScore: blendedExpression,
      };

      if (shouldComplete) {
        updateData.status = 'completed';
        updateData.completedAt = new Date();
        updateData.feedback = mlPipelineOutput.feedback;
      }

      await tx.update(sessions).set(updateData).where(eq(sessions.id, numericSessionId));

      if (shouldComplete) {
        const [icebreakerStats] = await tx
          .select({
            total: sql<number>`count(*)::int`,
            passed: sql<number>`count(*) filter (where used_correctly = true)::int`,
          })
          .from(vocabularyEncounters)
          .where(and(
            eq(vocabularyEncounters.sessionId, numericSessionId),
            eq(vocabularyEncounters.phase, 'icebreaker'),
          ));

        const icebreakerPassRate = icebreakerStats && icebreakerStats.total > 0
          ? Math.round((icebreakerStats.passed / icebreakerStats.total) * 100)
          : 0;

        const finalVocabScore = Math.round((blendedVocab + icebreakerPassRate) / 2);
        const finalGrammarScore = blendedGrammar;
        const finalFluencyScore = Math.round((blendedFluency + runningScore) / 2);
        const finalCulturalScore = blendedCultural;
        const finalTaskScore = Math.round((blendedTask + runningScore) / 2);
        const finalExpressionScore = blendedExpression;

        await tx.insert(evaluations).values({
          sessionId: numericSessionId,
          vocabularyScore: finalVocabScore,
          grammarScore: finalGrammarScore,
          fluencyScore: finalFluencyScore,
          culturalScore: finalCulturalScore,
          taskScore: finalTaskScore,
          expressionAppropriatenessScore: finalExpressionScore,
          feedback: mlPipelineOutput.feedback,
        });

        const totalScore = finalVocabScore + finalGrammarScore + finalFluencyScore + finalCulturalScore + finalTaskScore + finalExpressionScore;
        const xpGained = Math.round(totalScore * 2.5 + 25);

        const [userRow] = await tx.select({
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

          await tx.update(users).set({
            xp: newXp,
            level: newLevel,
            xpToNext: newXpToNext,
            streak: newStreak,
            lastActiveDate: today,
          }).where(eq(users.id, user.id));
        }
      }

      return {
        type: 'normal' as const,
        newPhase,
        runningScore,
        shouldComplete,
        responseCorrections: currentPhase === 'unguided' ? [] : (mlPipelineOutput.corrections ?? []),
      };
    });

    if (writeResult.type === 'retry') {
      return Response.json({
        success: true,
        phase: currentPhase,
        retry: true,
        analysis: {
          messageTarget: mlPipelineOutput.messageTarget,
          messageNative: mlPipelineOutput.messageNative,
          messagePhonetic: mlPipelineOutput.messagePhonetic,
          emotionTone: mlPipelineOutput.emotionTone,
          gestureHint: mlPipelineOutput.gestureHint,
          isEnglishWhenExpected: mlPipelineOutput.isEnglishWhenExpected,
          isValidInContext: mlPipelineOutput.isValidInContext,
          corrections: mlPipelineOutput.corrections.map(c => ({
            ...c,
            correctionType: c.correctionType,
            originalText: c.originalText,
            originalPhonetic: c.originalPhonetic ?? null,
            correctedText: c.correctedText,
            correctedPhonetic: c.correctedPhonetic ?? null,
            explanation: c.explanation,
            severity: c.severity,
          })),
          suggestedReplies: mlPipelineOutput.suggestedReplies ?? [],
        },
      });
    }

    // ── Response ──
    const responsePayload: Record<string, any> = {
      success: true,
      phase: writeResult.newPhase,
      runningScore: writeResult.runningScore,
      analysis: {
        ...mlPipelineOutput,
        corrections: writeResult.responseCorrections,
        scenarioComplete: writeResult.shouldComplete,
        scenarioUserRole: currentScenario.userCharacterRole,
        scenarioUserName: currentScenario.userCharacterName,
        aiCharacterName: currentScenario.aiCharacterName,
      },
    };

    return Response.json(responsePayload);

  } catch (error) {
    if (error instanceof AIQuotaError) {
      console.error(`[AI QUOTA] ${error.verboseLog}`);
      const retryAfter = error.retryAfterSeconds ?? 60;
      return Response.json(
        {
          error: 'AI service quota exceeded',
          detail: error.message,
          retryAfterSeconds: retryAfter,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    if (error instanceof AIModelError) {
      console.error(`[AI MODEL] ${error.verboseLog}`);
      return Response.json(
        {
          error: 'AI model unavailable',
          detail: error.message,
        },
        { status: 502 },
      );
    }

    if (error instanceof AIProviderError) {
      console.error(`[AI PROVIDER] ${error.verboseLog}`);
      return Response.json(
        {
          error: 'AI provider error',
          detail: error.message,
        },
        { status: 502 },
      );
    }

    console.error('[CHAT] Unhandled error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}