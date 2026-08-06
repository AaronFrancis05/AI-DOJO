import { db } from '../../../../src/db';
import { sessions } from '../../../../src/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '../../../../lib/auth/server';
import { loadSessionTurnData, analyzeTurn } from '../../../../lib/roleplay/analyze-turn';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawSessionId = body.sessionId;
    const rawUserInput = body.userRawInput;
    const isRetryOfPreviousMistake = body.isRetryOfPreviousMistake === true;

    if (!rawSessionId || !rawUserInput) {
      return Response.json({ error: 'sessionId and userRawInput are required' }, { status: 400 });
    }

    const sessionId = Number(String(rawSessionId));
    if (isNaN(sessionId)) {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userId !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status === 'completed') {
      return Response.json({ error: 'Session is already completed' }, { status: 400 });
    }

    const turnData = await loadSessionTurnData(session);
    if (!turnData.scenario) {
      return Response.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const analysis = await analyzeTurn({
      userInput: String(rawUserInput),
      scenario: turnData.scenario,
      data: turnData,
    });

    return Response.json({
      messageTarget: analysis.messageTarget,
      messageNative: analysis.messageNative,
      messagePhonetic: analysis.messagePhonetic,
      isValidInContext: analysis.isValidInContext,
      isEnglishWhenExpected: analysis.isEnglishWhenExpected,
      emotionTone: analysis.emotionTone,
      gestureHint: analysis.gestureHint,
      suggestedReplies: analysis.suggestedReplies ?? [],
      scores: analysis.scores,
      feedback: analysis.feedback,
      corrections: (analysis.corrections ?? []).map(c => ({
        ...c,
        originalPhonetic: c.originalPhonetic ?? null,
        correctedPhonetic: c.correctedPhonetic ?? null,
      })),
      goalsAddressedThisTurn: analysis.goalsAddressedThisTurn ?? [],
      scenarioComplete: analysis.scenarioComplete,
    });
  } catch (error) {
    console.error('[ANALYZE TURN] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
