import { db } from '../../../src/db';
import { conversations, evaluations, scenarios } from '../../../src/schema';
import { analyzeAndGenerateTurn } from '../../../lib/ai-engine'; // 👈 Swapped to your new multi-turn engine function
import { eq } from 'drizzle-orm';

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

        // 2. Fetch static reference context parameters from database seed
        const [scenario] = await db
            .select()
            .from(scenarios)
            .where(eq(scenarios.id, Number(scenarioId)));

        if (!scenario) {
            return Response.json(
                { error: `Scenario configuration ID ${scenarioId} not found` },
                { status: 404 }
            );
        }

        // 3. Call the upgraded Machine Learning pipeline to evaluate user text AND build the AI response
        const mlPipelineOutput = await analyzeAndGenerateTurn(
            userRawInputJp,
            Number(currentTurnNo),
            scenario // Pass the whole row object so Gemini reads character names, roles, goals, etc.
        );

        // 4. Persist the dynamic user conversation turn instantly
        await db.insert(conversations).values({
            scenarioId: Number(scenarioId),
            userId: Number(userId),
            turnNo: Number(currentTurnNo),
            speaker: 'user',
            messageJp: userRawInputJp,
            messageRomaji: mlPipelineOutput.messageRomaji,
            messageEn: mlPipelineOutput.messageEn,
            notes: `Dynamically processed user turn: ${mlPipelineOutput.isValidInContext ? 'Valid' : 'Off-context'}`
        });

        // 5. Persist the AI character's fluid response back right behind it to build a proper history log
        await db.insert(conversations).values({
            scenarioId: Number(scenarioId),
            userId: Number(userId),
            turnNo: Number(currentTurnNo),
            speaker: 'ai',
            messageJp: mlPipelineOutput.nextAiReply?.japanese || '分かりました。',
            messageRomaji: mlPipelineOutput.nextAiReply?.romaji || 'Wakarimashita.',
            messageEn: mlPipelineOutput.nextAiReply?.english || 'I understand.',
            notes: `Dynamic AI text from character: ${scenario.aiCharacterName}`
        });

        // 6. If conversation path concludes (e.g., Turn 3), save generated metrics to evaluations table
        if (Number(currentTurnNo) >= 3) {
            await db.insert(evaluations).values({
                userId: Number(userId),
                scenarioId: Number(scenarioId),
                vocabularyScore: mlPipelineOutput.scores.vocabulary,
                grammarScore: mlPipelineOutput.scores.grammar,
                fluencyScore: mlPipelineOutput.scores.fluency,
                culturalScore: mlPipelineOutput.scores.cultural,
                taskScore: mlPipelineOutput.scores.task,
                feedback: mlPipelineOutput.feedback
            });
        }

        // 7. Return the complete response (including nextAiReply) back to the client UI safely
        return Response.json({
            success: true,
            analysis: mlPipelineOutput
        });

    } catch (error) {
        console.error('❌ Crash detected in active conversation API pipeline:', error);
        return Response.json(
            { error: 'Internal pipeline processing transaction failure' },
            { status: 500 }
        );
    }
}