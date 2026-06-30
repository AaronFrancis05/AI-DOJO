import { db } from '../../../src/db';
import { conversations, evaluations, scenarios, scenarioGoals, goalCompletions } from '../../../src/schema';
import { analyzeAndGenerateTurn } from '../../../lib/ai-engine';
import { eq, and } from 'drizzle-orm';

const SAFETY_CAP_TURN = 10;

export async function POST(req: Request) {
    try {
        // 1. Unpack body safely
        const body = await req.json();
        const { userId, scenarioId, userRawInputJp, currentTurnNo } = body;

        // Validation Guardrails
        if (!userId || !scenarioId || !userRawInputJp || !currentTurnNo) {
            return Response.json(
                { error: 'Missing required parameters in request body' },
                { status: 400 }
            );
        }

        const numericUserId = Number(userId);
        const numericScenarioId = Number(scenarioId);
        const numericTurnNo = Number(currentTurnNo);

        if (isNaN(numericUserId) || isNaN(numericScenarioId) || isNaN(numericTurnNo)) {
            return Response.json(
                { error: 'Non-numeric field in userId, scenarioId, or currentTurnNo' },
                { status: 400 }
            );
        }

        // 2. Fetch static reference context parameters from database seed
        const [scenario] = await db
            .select()
            .from(scenarios)
            .where(eq(scenarios.id, numericScenarioId));

        if (!scenario) {
            return Response.json(
                { error: `Scenario configuration ID ${scenarioId} not found` },
                { status: 404 }
            );
        }

        // 3. Fetch structured goals for this scenario
        const goals = await db
            .select()
            .from(scenarioGoals)
            .where(eq(scenarioGoals.scenarioId, numericScenarioId))
            .orderBy(scenarioGoals.sequenceOrder);

        // 4. Fetch already-completed goal sequence orders for this user+scenario
        const existingCompletions = await db
            .select({ seqOrder: scenarioGoals.sequenceOrder })
            .from(goalCompletions)
            .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
            .where(
                and(
                    eq(goalCompletions.userId, numericUserId),
                    eq(scenarioGoals.scenarioId, numericScenarioId)
                )
            );

        const completedSequenceOrders = existingCompletions.map(c => c.seqOrder);

        // 5. Call the goal-aware ML pipeline
        const mlPipelineOutput = await analyzeAndGenerateTurn(
            userRawInputJp,
            numericTurnNo,
            scenario,
            goals,
            completedSequenceOrders
        );

        // 6. Persist the dynamic user conversation turn and capture its ID
        const [userConversation] = await db.insert(conversations).values({
            scenarioId: numericScenarioId,
            userId: numericUserId,
            turnNo: numericTurnNo,
            speaker: 'user',
            messageJp: userRawInputJp,
            messageRomaji: mlPipelineOutput.messageRomaji,
            messageEn: mlPipelineOutput.messageEn,
            notes: `Dynamically processed user turn: ${mlPipelineOutput.isValidInContext ? 'Valid' : 'Off-context'}`
        }).returning({ id: conversations.id });

        // 7. Persist the AI character's fluid response (including per-turn teaching note)
        await db.insert(conversations).values({
            scenarioId: numericScenarioId,
            userId: numericUserId,
            turnNo: numericTurnNo,
            speaker: 'ai',
            messageJp: mlPipelineOutput.nextAiReply?.japanese || '分かりました。',
            messageRomaji: mlPipelineOutput.nextAiReply?.romaji || 'Wakarimashita.',
            messageEn: mlPipelineOutput.nextAiReply?.english || 'I understand.',
            notes: `Dynamic AI text from character: ${scenario.aiCharacterName}`,
            teachingNote: mlPipelineOutput.teachingNote || null
        });

        // 8. Record goal completions for this turn (idempotent: skip already-completed + dedupe within turn)
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
                    conversationId: userConversation.id,
                    scenarioGoalId: goalsMap.get(seqOrder)!,
                    userId: numericUserId,
                    achieved: true,
                    evidenceNote: `Addressed in turn ${numericTurnNo}: "${userRawInputJp.substring(0, 80)}"`
                }));
            if (completionRows.length > 0) {
                await db.insert(goalCompletions).values(completionRows);
            }
        }

        // 9. Determine if conversation is complete
        const shouldComplete = mlPipelineOutput.scenarioComplete || numericTurnNo >= SAFETY_CAP_TURN;

        if (shouldComplete) {
            await db.insert(evaluations).values({
                userId: numericUserId,
                scenarioId: numericScenarioId,
                vocabularyScore: mlPipelineOutput.scores.vocabulary,
                grammarScore: mlPipelineOutput.scores.grammar,
                fluencyScore: mlPipelineOutput.scores.fluency,
                culturalScore: mlPipelineOutput.scores.cultural,
                taskScore: mlPipelineOutput.scores.task,
                feedback: mlPipelineOutput.feedback
            });
        }

        // 10. Return the complete response (reflect the server's final completion decision)
        return Response.json({
            success: true,
            analysis: {
                ...mlPipelineOutput,
                scenarioComplete: shouldComplete,
                scenarioUserRole: scenario.userCharacterRole,
                scenarioUserName: scenario.userCharacterName
            }
        });

    } catch (error) {
        console.error('❌ Crash detected in active conversation API pipeline:', error);
        return Response.json(
            { error: 'Internal pipeline processing transaction failure' },
            { status: 500 }
        );
    }
}