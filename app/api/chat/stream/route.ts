import { db } from '../../../../src/db';
import { dbPool, withSessionLock } from '../../../../src/db-pool';
import { sessions, conversations, corrections, evaluations, scenarioGoals, goalCompletions, scenarios, situations, users, vocabularyEncounters, vocabulary, audioJobs } from '../../../../src/schema';

type ScenarioRow = typeof scenarios.$inferSelect;
type SituationRow = typeof situations.$inferSelect;
type GoalRow = typeof scenarioGoals.$inferSelect;
import { analyzeUserTurn } from '../../../../lib/ai-engine';
import type { ChatTurn } from '../../../../lib/ai-providers';
import { getAIProvider, AIProviderError, AIQuotaError, AIModelError } from '../../../../lib/ai-providers';
import { getTargetLangConfig, getNativeLangName, getBCP47 } from '../../../../lib/language';
import { nextPhase, UNGUIDED_MISTAKE_PENALTY, UNGUIDED_ENGLISH_PENALTY, type SessionPhase } from '../../../../lib/roleplay/phase-engine';
import { eq, and, asc, sql } from 'drizzle-orm';
import { getAuthUser } from '../../../../lib/auth/server';
import { validateDelimiters } from '../../../../lib/roleplay/lang-detect';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../../../../lib/cache';

const SAFETY_CAP_TURN = 15;
const MAX_ICEBREAKER_VOCAB = 5;

async function enqueueAudioJob(
  conversationId: number,
  sessionId: number,
  text: string,
  lang: string,
  phase: string,
  speaker: string,
  voiceGender?: string,
): Promise<void> {
  try {
    await db.insert(audioJobs).values({
      conversationId,
      sessionId,
      text,
      lang,
      phase,
      speaker,
      voiceGender: voiceGender ?? null,
    });
  } catch (err) {
    console.error('[AUDIO QUEUE] Failed to enqueue job:', err);
  }
}

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

    const sessionId = String(rawSessionId);
    const userRawInput = String(rawUserInput);
    const numericSessionId = Number(sessionId);
    if (isNaN(numericSessionId)) {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, numericSessionId));
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userId !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status !== 'active') {
      return Response.json({ error: 'Session is already completed' }, { status: 400 });
    }

    const { scenarioId } = session;
    const behaviorMode = session.behaviorMode ?? 'standard';
    const targetLanguage = session.targetLanguage ?? 'ja';
    const nativeLanguage = session.nativeLanguage ?? 'en';
    const isSameLanguage = targetLanguage === nativeLanguage;
    let phaseTurnCount = session.phaseTurnCount ?? 0;

    const [currentScenario, conversationRows, goalsResult, completionsResult, situationResult] = await Promise.all([
      (async (): Promise<ScenarioRow | null> => {
        const k = cacheKeys.scenario(scenarioId);
        const c = await cacheGet<ScenarioRow | null>(k);
        if (c) return c;
        const r = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).then(r => r[0] ?? null);
        if (r) await cacheSet(k, r, TTL.SCENARIO);
        return r;
      })(),

      db
        .select()
        .from(conversations)
        .where(eq(conversations.sessionId, numericSessionId))
        .orderBy(asc(conversations.turnNo)),

      (async (): Promise<GoalRow[]> => {
        const k = cacheKeys.goals(scenarioId);
        const c = await cacheGet<GoalRow[]>(k);
        if (c) return c;
        const r = await db.select().from(scenarioGoals).where(eq(scenarioGoals.scenarioId, scenarioId)).orderBy(asc(scenarioGoals.sequenceOrder));
        await cacheSet(k, r, TTL.GOALS);
        return r;
      })(),

      db
        .select({ seqOrder: scenarioGoals.sequenceOrder })
        .from(goalCompletions)
        .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
        .where(and(eq(goalCompletions.sessionId, numericSessionId), eq(scenarioGoals.scenarioId, scenarioId))),

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
    ]);

    if (!currentScenario) {
      return Response.json({ error: 'Scenario not found' }, { status: 404 });
    }

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

    const conversationHistory: ChatTurn[] = conversationRows.map(row => ({
      role: row.speaker === 'ai' ? 'assistant' as const : 'user' as const,
      content: row.messageNative ?? row.messageTarget,
    }));

    const targetLangName = getTargetLangConfig(targetLanguage).name;
    const nativeLangName = getNativeLangName(nativeLanguage);
    const currentPhase = session.phase as SessionPhase;

    // ── Load scenario vocabulary for icebreaker phase ──
    let vocabRows = currentPhase === 'icebreaker' || currentPhase === 'guided'
      ? await (async (): Promise<typeof vocabulary.$inferSelect[]> => {
            const k = cacheKeys.vocabulary(scenarioId);
            const c = await cacheGet<typeof vocabulary.$inferSelect[]>(k);
            if (c) return c;
            const r = await db.select().from(vocabulary).where(eq(vocabulary.scenarioId, scenarioId)).orderBy(vocabulary.id);
            await cacheSet(k, r, TTL.VOCABULARY);
            return r;
          })()
      : [];

    if (currentPhase === 'icebreaker' && vocabRows.length > MAX_ICEBREAKER_VOCAB) {
      vocabRows = vocabRows.slice(0, MAX_ICEBREAKER_VOCAB);
    }

    const isSessionStart = userRawInput === '__session_start__';
    const effectiveInput = isSessionStart ? '' : userRawInput;

    const vocabBlock = vocabRows.length > 0
      ? `Key vocabulary for this lesson:\n${
          isSameLanguage
            ? vocabRows.map((v, i) => `  ${i + 1}. "${v.translation}"${v.usageTip ? ` — ${v.usageTip}` : ''}`).join('\n')
            : vocabRows.map((v, i) => {
                const hasRomaji = getTargetLangConfig(targetLanguage).hasRomaji;
                const romajiPart = hasRomaji && v.romaji ? ` (${v.romaji})` : '';
                return `  ${i + 1}. "${v.targetText}"${romajiPart} = "${v.translation}"`;
              }).join('\n')
        }`
      : '';

    const goalsBlock = goals.map(g => {
      const done = completedSequenceOrders.includes(g.sequenceOrder);
      const status = done ? '[COVERED]' : '[PENDING]';
      return `  ${status} Goal ${g.sequenceOrder} (${g.goalType}): ${g.goalText}`;
    }).join('\n');

    const modeInstruction = behaviorMode === 'trouble'
      ? `The AI character should be MORE DIFFICULT to deal with — less cooperative, more complex vocabulary, occasionally misunderstand the user.`
      : `The AI character should be cooperative, friendly, and helpful.`;

    const scenarioTitle = situationResult?.title ?? currentScenario.title;
    const scenarioContextBlock = `
===== SCENARIO =====
Title: ${scenarioTitle}
Setting: ${situationContext}
Learning goals: ${situationLearningGoals}
=====================`;

    // ── Phase-specific prompts ──
    const icebreakerRules = `
ROLE: You are a LANGUAGE TEACHER, not just a roleplay character. Your primary job is TEACHING vocabulary through conversation.

PHASE: ICEBREAKER — You are introducing the student to key vocabulary for the upcoming roleplay scenario described below. Every word you teach must be directly relevant to this specific scenario.

${scenarioContextBlock}

${vocabBlock}

Rules for icebreaker phase:
- STRICT VOCAB LIMIT: You have EXACTLY ${vocabRows.length} vocabulary word(s) listed above. Teach ONLY these words and in this exact order. Do NOT create, invent, or add any words beyond this list. If the student says something unrelated, acknowledge it briefly and return to the current word.
- BREVITY: Keep your entire response to 2-3 sentences max. Do not give long explanations.
- ALWAYS begin by greeting the student in ${nativeLangName} and explaining what the scenario is about, using the title and setting above.
- For each word: say the ${targetLangName} word (with romaji in parentheses), then clearly say its ${nativeLangName} meaning.
- After introducing a word, ask the student to repeat it back to you.
- Keep your tone encouraging and supportive — the student is a beginner.
- Use a mix of ${nativeLangName} for explanations and ${targetLangName} (with romaji) for the vocabulary itself.
- Do NOT cover multiple words at once. One word per turn.
- After the student attempts a word, give very brief feedback (5 words max) in ${nativeLangName} on their attempt, then introduce the next word.
- Mark the vocabulary word you are currently teaching by saying "【VOCAB N】" at the start of your teaching turn, where N is the word number (1-based).
- If the student's input is empty (session start), give a warm greeting and start teaching word 1.
- CRITICAL: Never teach vocabulary unrelated to this scenario. Stay on-topic. Use ONLY the listed scenario vocabulary.

===== OUTPUT FORMAT (MANDATORY) =====
Wrap every ${targetLangName} span — the word/phrase itself plus its romaji in parentheses — in ⟦ ⟧ delimiters. Everything OUTSIDE ⟦ ⟧ must be pure ${nativeLangName}, and everything INSIDE ⟦ ⟧ must be ${targetLangName} (+ romaji). Never place ${nativeLangName} text inside ⟦ ⟧, and never place ${targetLangName} text outside it.

Example: Let's learn a useful word. In Japanese, we say ⟦ありがとう (arigatou)⟧ — it means 'thank you'. Can you say ⟦ありがとう (arigatou)⟧?`;

    const guidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}) in a ${targetLangName} language learning roleplay. You are also a language coach.

${scenarioContextBlock}

${vocabBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES FOR GUIDED PHASE:
- TURN LIMIT: You have a maximum of 8 turns (responses) for this guided phase. You MUST drive the conversation efficiently toward completing ALL remaining learning goals within these 8 turns. Do not waste turns on repetition.
- Stay in character as ${currentScenario.aiCharacterName} at ALL times. Every response must feel like it belongs to this specific scenario.
- LANGUAGE SEPARATION: Every response has TWO strictly separated parts:
  1. EXPLANATION / CORRECTION / GUIDANCE part: Write in pure ${nativeLangName}. No ${targetLangName}-accented ${nativeLangName} — it must sound like a native ${nativeLangName} speaker wrote it.
  2. ROLEPLAY DIALOGUE part: Write in pure ${targetLangName}. Natural in-character dialogue that advances the scenario.
- Switch between the two cleanly — don't mix languages in the same sentence.
- Always include romaji in parentheses after any ${targetLangName} text.
- Keep the overall response to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- CRITICAL: Every response must be grounded in the scenario setting above. Do not generate generic phrases that ignore the situation.

===== OUTPUT FORMAT (MANDATORY) =====
Wrap every ${targetLangName} span — the roleplay line itself plus its romaji in parentheses — in ⟦ ⟧ delimiters. Everything OUTSIDE ⟦ ⟧ must be pure ${nativeLangName}, and everything INSIDE ⟦ ⟧ must be ${targetLangName} (+ romaji). Never place ${nativeLangName} text inside ⟦ ⟧, and never place ${targetLangName} text outside it.

Example: The particle 'は' marks the topic, while 'が' marks the subject. Now you try: ⟦これはなんですか (kore wa nan desu ka)⟧？`;

    const unguidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}) in a ${targetLangName} language learning roleplay. This is FULL IMMERSION mode.

${scenarioContextBlock}

${vocabBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES FOR UNGUIDED PHASE:
- TURN LIMIT: You have a maximum of 8 turns (responses) for this unguided phase. Drive the conversation efficiently to cover all remaining goals within these 8 turns.
- FULL IMMERSION: Reply entirely in ${targetLangName}. Do NOT use ${nativeLangName} for any reason.
- Stay in character as ${currentScenario.aiCharacterName} at all times.
- Always include romaji in parentheses after every ${targetLangName} sentence.
- Keep responses natural, conversational, and in-character — driven entirely by the scenario setting above.
- Drive the conversation toward completing the remaining goals naturally within the scenario.
- Keep responses to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- CRITICAL: Every response must be grounded in the specific scenario setting. Never resort to generic greetings or phrases that ignore the situation.

===== OUTPUT FORMAT (MANDATORY) =====
Wrap every ${targetLangName} span in ⟦ ⟧ delimiters. Since unguided phase is 100% ${targetLangName}, virtually all text should be inside ⟦ ⟧. Include romaji inside the delimiters: ⟦${targetLangName} text (romaji)⟧.

Example: ⟦こんにちは (konnichiwa)⟧ ⟦お元気ですか (ogenki desu ka)⟧？`;

    // ── Same-language prompt variants (no dual-language, no delimiters) ──
    const sameLangIcebreakerRules = `
ROLE: You are a TEACHER. Your primary job is TEACHING vocabulary through conversation.

PHASE: ICEBREAKER — You are introducing the student to key vocabulary for the upcoming roleplay scenario described below.

${scenarioContextBlock}

${vocabBlock}

Rules:
- You have EXACTLY ${vocabRows.length} vocabulary word(s) listed above. Teach ONLY these words and in this exact order.
- BREVITY: Keep your entire response to 2-3 sentences max.
- Greet the student and explain what the scenario is about.
- For each word: present the word, clearly explain its meaning, and ask the student to repeat it.
- Keep your tone encouraging and supportive.
- Do NOT cover multiple words at once. One word per turn.
- After the student attempts a word, give brief feedback, then introduce the next word.
- Mark the vocabulary word by saying "【VOCAB N】" at the start of your teaching turn.
- Speak naturally in ${targetLangName}. No delimiters, no romaji, no language switching.`;

    const sameLangGuidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}).

${scenarioContextBlock}

${vocabBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES:
- Stay in character as ${currentScenario.aiCharacterName} at all times. Every response must feel like it belongs to this specific scenario.
- Speak naturally in ${targetLangName}. No coaching, no explanations, no breaking character.
- Keep the overall response to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- Drive the conversation forward naturally toward completing the remaining goals.
- CRITICAL: Every response must be grounded in the scenario setting above. Never give language lessons or coaching — just act the roleplay.`;

    const sameLangUnguidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}).

${scenarioContextBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES:
- Stay in character as ${currentScenario.aiCharacterName} at all times.
- Speak naturally in ${targetLangName}. No coaching, no explanations, no breaking character.
- Keep responses to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- Drive the conversation toward completing the remaining goals naturally within the scenario.
- CRITICAL: Every response must be grounded in the scenario setting. Never resort to generic greetings or phrases that ignore the situation.`;

    // ── Pre-generation phase check: enforce icebreaker vocab cap ──
    // The greeting (turn 1) teaches VOCAB 1. Each subsequent user response
    // triggers the next VOCAB. Icebreaker ends when all vocab words are taught.
    const totalIcebreakerTurns = vocabRows.length; // greeting + (N-1) user turns
    const isIcebreakerExhausted = currentPhase === 'icebreaker'
      && !isSessionStart
      && currentTurnNo > totalIcebreakerTurns;

    const streamSystemPrompt = isSameLanguage
      ? (currentPhase === 'icebreaker'
          ? (isIcebreakerExhausted ? sameLangGuidedRules : sameLangIcebreakerRules)
          : (currentPhase === 'guided' ? sameLangGuidedRules : sameLangUnguidedRules))
      : (currentPhase === 'icebreaker'
          ? (isIcebreakerExhausted ? guidedRules : icebreakerRules)
          : (currentPhase === 'guided' ? guidedRules : unguidedRules));

    const streamUserMsg = isSessionStart
      ? `[SESSION START] The student is ready to begin. This is the first turn.`
      : `[Turn ${currentTurnNo}] The student says: "${effectiveInput}"`;

    // ── Build SSE response stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            /* client disconnected — ignore */
          }
        };

        try {
          const provider = await getAIProvider();
          let fullAiText = '';

          // Phase 1: Stream the AI reply text
          for await (const chunk of provider.generateStream(streamSystemPrompt, [
            ...conversationHistory,
            { role: 'user', content: streamUserMsg },
          ])) {
            fullAiText += chunk;
            send(JSON.stringify({ type: 'token', text: chunk }));
          }

          if (!fullAiText.trim()) {
            fullAiText = `I understand. Please continue with the conversation.`;
            send(JSON.stringify({ type: 'token', text: fullAiText }));
          }

          // Validate ⟦ ⟧ delimiter usage when languages differ
          const targetBcp47 = getBCP47(targetLanguage, 'tts');
          const nativeBcp47 = getBCP47(nativeLanguage, 'tts');
          if (!isSameLanguage) {
            const validation = validateDelimiters(fullAiText, targetBcp47, nativeBcp47);
            if (!validation.valid) {
              console.warn('[SPAN VALIDATOR] delimiter issues:', validation.issues);
            }
          }

          // Phase 2: Analyze the user's turn (skip for session start greeting)
          if (isSessionStart) {
            let aiConversationId: number | null = null;
            const { newPhase: sessionStartPhase } = await withSessionLock(numericSessionId, async (tx) => {
              const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
              if (freshSession.status !== 'active') throw new Error('Session was completed by another request');

              const existingGreeting = await tx.select({ id: conversations.id })
                .from(conversations)
                .where(and(
                  eq(conversations.sessionId, numericSessionId),
                  eq(conversations.turnNo, currentTurnNo)
                ))
                .limit(1);
              if (existingGreeting.length > 0) throw new Error('Session start already processed');

              const [aiConversation] = await tx.insert(conversations).values({
                sessionId: numericSessionId,
                turnNo: currentTurnNo,
                speaker: 'ai',
                messageTarget: fullAiText,
                messageNative: '',
                messageRomaji: null,
                isValidInContext: true,
              }).returning({ id: conversations.id });

              aiConversationId = aiConversation?.id ?? null;

              const icebreakerDoneInner = currentPhase === 'icebreaker' && vocabRows.length > 0
                ? currentTurnNo >= vocabRows.length
                : false;
              const newPhaseInner = nextPhase(currentPhase, { icebreakerDone: icebreakerDoneInner, allGoalsCovered: false });

              await tx.update(sessions).set({
                phase: newPhaseInner,
                totalTurns: currentTurnNo,
              }).where(eq(sessions.id, numericSessionId));

              return { newPhase: newPhaseInner };
            });

            if (aiConversationId) {
              enqueueAudioJob(
                aiConversationId,
                numericSessionId,
                fullAiText,
                targetBcp47,
                currentPhase,
                'ai',
                session.voiceGender ?? undefined,
              );
            }

              send(JSON.stringify({
                type: 'done',
                fullText: fullAiText,
                phase: sessionStartPhase,
                analysis: { corrections: [], suggestedReplies: [] },
              }));
              try { controller.close(); } catch {}
              return;
          }

          const analysis = await analyzeUserTurn(
            userRawInput,
            fullAiText,
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

          const correctionItems = analysis.corrections ?? [];
          const hasCorrections = correctionItems.length > 0 && correctionItems.some(c => c.correctedText);

          // ── Guided phase: retry gate ──
          let pendingRetryCorrectionId: number | null = null;
          let retryEarlyExit = false;

          if (currentPhase === 'guided' && hasCorrections) {
            const prevPendingId = session.pendingRetryCorrectionId;

            if (prevPendingId && isRetryOfPreviousMistake) {
              await withSessionLock(numericSessionId, async (tx) => {
                if (prevPendingId) {
                  await tx.update(corrections).set({
                    isFinalAttempt: true,
                  }).where(eq(corrections.id, prevPendingId));
                }
                await tx.update(sessions).set({
                  pendingRetryCorrectionId: null,
                }).where(eq(sessions.id, numericSessionId));
              });
            } else if (!prevPendingId && !isRetryOfPreviousMistake) {
              const validCorrections = correctionItems.filter(c => c.correctedText);
              if (validCorrections.length > 0) {
                const { newPendingRetryId, userConvId } = await withSessionLock(numericSessionId, async (tx) => {
                  const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
                  if (freshSession.status !== 'active') throw new Error('Session was completed by another request');

                  const existingTurn = await tx.select({ id: conversations.id })
                    .from(conversations)
                    .where(and(
                      eq(conversations.sessionId, numericSessionId),
                      eq(conversations.turnNo, currentTurnNo)
                    ))
                    .limit(1);
                  if (existingTurn.length > 0) throw new Error('Turn already processed');

                  const [userConversation] = await tx.insert(conversations).values({
                    sessionId: numericSessionId,
                    turnNo: currentTurnNo,
                    speaker: 'user',
                    messageTarget: analysis.messageTarget,
                    messageNative: analysis.messageNative,
                    messageRomaji: analysis.messageRomaji,
                    emotionTone: analysis.emotionTone ?? null,
                    gestureHint: analysis.gestureHint ?? null,
                  }).returning({ id: conversations.id });

                  const inserted = await tx.insert(corrections).values(
                    validCorrections.map(c => ({
                      conversationId: userConversation.id,
                      correctionType: c.correctionType,
                      originalText: c.originalText,
                      originalRomaji: c.originalRomaji ?? null,
                      correctedText: c.correctedText,
                      correctedRomaji: c.correctedRomaji ?? null,
                      explanation: c.explanation,
                      severity: c.severity,
                    }))
                  ).returning({ id: corrections.id });

                  const newPendingId = inserted[0]?.id ?? null;
                  if (newPendingId) {
                    await tx.update(sessions).set({
                      pendingRetryCorrectionId: newPendingId,
                    }).where(eq(sessions.id, numericSessionId));
                  }

                  return { newPendingRetryId: newPendingId, userConvId: userConversation.id };
                });

                pendingRetryCorrectionId = newPendingRetryId;
              }

              send(JSON.stringify({
                type: 'retry',
                analysis: {
                  messageTarget: analysis.messageTarget,
                  messageNative: analysis.messageNative,
                  messageRomaji: analysis.messageRomaji,
                  emotionTone: analysis.emotionTone,
                  gestureHint: analysis.gestureHint,
                  corrections: correctionItems.map(c => ({
                    ...c,
                    originalRomaji: c.originalRomaji ?? null,
                    correctedRomaji: c.correctedRomaji ?? null,
                  })),
                  suggestedReplies: analysis.suggestedReplies ?? [],
                },
              }));
              try { controller.close(); } catch {}
              return;
            }
          }

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

            const freshPhaseTurnCount = freshSession.phaseTurnCount ?? 0;

            const [userConversation] = await tx.insert(conversations).values({
              sessionId: numericSessionId,
              turnNo: currentTurnNo,
              speaker: 'user',
              messageTarget: analysis.messageTarget,
              messageNative: analysis.messageNative,
              messageRomaji: analysis.messageRomaji,
              emotionTone: analysis.emotionTone ?? null,
              gestureHint: analysis.gestureHint ?? null,
            }).returning({ id: conversations.id });

            if (hasCorrections) {
              const validCorrections = correctionItems.filter(c => c.correctedText);
              if (validCorrections.length > 0) {
                await tx.insert(corrections).values(
                  validCorrections.map(c => ({
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
            }

            const [aiConversation] = await tx.insert(conversations).values({
              sessionId: numericSessionId,
              turnNo: currentTurnNo,
              speaker: 'ai',
              messageTarget: fullAiText,
              messageNative: '',
              messageRomaji: null,
              isValidInContext: true,
            }).returning({ id: conversations.id });

            if (analysis.goalsAddressedThisTurn?.length > 0) {
              const goalsMap = new Map(goals.map(g => [g.sequenceOrder, g.id]));
              const seen = new Set<number>();
              const completionRows = analysis.goalsAddressedThisTurn
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

            let runningScoreInner = freshSession.runningScore;
            if (currentPhase === 'unguided' && hasCorrections) {
              runningScoreInner -= correctionItems.filter(c => c.correctedText).length * UNGUIDED_MISTAKE_PENALTY;
              if (analysis.isEnglishWhenExpected) {
                runningScoreInner -= UNGUIDED_ENGLISH_PENALTY;
              }
              if (runningScoreInner < 0) runningScoreInner = 0;
            }

            const goalsCompleted = analysis.goalsAddressedThisTurn?.filter(
              seqOrder => !completedSequenceOrders.includes(seqOrder)
            ).length ?? 0;
            const totalGoalsNow = completedSequenceOrders.length + goalsCompleted;
            const maxPhaseTurnsReached = (currentPhase === 'guided' || currentPhase === 'unguided')
              && freshPhaseTurnCount >= 8;
            const allGoalsCoveredInner = maxPhaseTurnsReached || totalGoalsNow >= goals.length;

            const icebreakerDoneInner = currentPhase === 'icebreaker' && vocabRows.length > 0
              ? currentTurnNo >= vocabRows.length
              : false;
            const newPhaseInner = nextPhase(currentPhase, {
              icebreakerDone: icebreakerDoneInner,
              allGoalsCovered: allGoalsCoveredInner,
            });
            const shouldCompleteInner = analysis.scenarioComplete || currentTurnNo >= SAFETY_CAP_TURN;

            let newPhaseTurnCount = freshPhaseTurnCount;
            if (newPhaseInner !== currentPhase) {
              newPhaseTurnCount = 0;
            } else {
              newPhaseTurnCount++;
            }

            const isCelebrationInner = shouldCompleteInner && allGoalsCoveredInner && (currentPhase === 'unguided' || newPhaseInner === 'evaluation');

            const currentVocabScore = freshSession.vocabularyScore ?? 0;
            const currentGrammarScore = freshSession.grammarScore ?? 0;
            const currentFluencyScore = freshSession.fluencyScore ?? 0;
            const currentCulturalScore = freshSession.culturalScore ?? 0;
            const currentTaskScore = freshSession.taskScore ?? 0;

            const scoredTurnsCount = Math.max(1, Math.floor((conversationRows.filter(c => c.speaker === 'user').length) + 1));

            const blendedVocab = Math.round(((currentVocabScore * (scoredTurnsCount - 1)) + analysis.scores.vocabulary) / scoredTurnsCount);
            const blendedGrammar = Math.round(((currentGrammarScore * (scoredTurnsCount - 1)) + analysis.scores.grammar) / scoredTurnsCount);
            const blendedFluency = Math.round(((currentFluencyScore * (scoredTurnsCount - 1)) + analysis.scores.fluency) / scoredTurnsCount);
            const blendedCultural = Math.round(((currentCulturalScore * (scoredTurnsCount - 1)) + analysis.scores.cultural) / scoredTurnsCount);
            const blendedTask = Math.round(((currentTaskScore * (scoredTurnsCount - 1)) + analysis.scores.task) / scoredTurnsCount);

            const updateData: Record<string, unknown> = {
              totalTurns: currentTurnNo,
              phaseTurnCount: newPhaseTurnCount,
              runningScore: runningScoreInner,
              phase: shouldCompleteInner ? 'completed' : newPhaseInner,
              vocabularyScore: blendedVocab,
              grammarScore: blendedGrammar,
              fluencyScore: blendedFluency,
              culturalScore: blendedCultural,
              taskScore: blendedTask,
            };

            if (shouldCompleteInner) {
              updateData.status = 'completed';
              updateData.completedAt = new Date();
              updateData.feedback = analysis.feedback;
            }

            await tx.update(sessions).set(updateData).where(eq(sessions.id, numericSessionId));

            if (shouldCompleteInner) {
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
              const finalFluencyScore = Math.round((blendedFluency + runningScoreInner) / 2);
              const finalTaskScore = Math.round((blendedTask + runningScoreInner) / 2);

              await tx.insert(evaluations).values({
                sessionId: numericSessionId,
                vocabularyScore: finalVocabScore,
                grammarScore: blendedGrammar,
                fluencyScore: finalFluencyScore,
                culturalScore: blendedCultural,
                taskScore: finalTaskScore,
                feedback: analysis.feedback,
              });

              const totalScore = finalVocabScore + blendedGrammar + finalFluencyScore + blendedCultural + finalTaskScore;
              const xpGained = Math.round(totalScore * 2.5 + 25);

              const [userRow] = await tx.select({
                xp: users.xp, streak: users.streak, lastActiveDate: users.lastActiveDate,
              }).from(users).where(eq(users.id, user.id));

              if (userRow) {
                const today = new Date().toISOString().slice(0, 10);
                const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                let newStreak = userRow.streak;
                if (userRow.lastActiveDate === today) {
                  // same day
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
                  xp: newXp, level: newLevel, xpToNext: newXpToNext,
                  streak: newStreak, lastActiveDate: today,
                }).where(eq(users.id, user.id));
              }
            }

            return {
              newPhase: newPhaseInner,
              runningScore: runningScoreInner,
              isCelebration: isCelebrationInner,
              aiConversationId: aiConversation?.id ?? null,
              shouldComplete: shouldCompleteInner,
            };
          });

          if (writeResult.aiConversationId) {
            enqueueAudioJob(
              writeResult.aiConversationId,
              numericSessionId,
              fullAiText,
              targetBcp47,
              currentPhase,
              'ai',
              session.voiceGender ?? undefined,
            );
          }

          // ── Phase transition announcement ──
          if (writeResult.newPhase !== currentPhase && !writeResult.shouldComplete) {
            let transitionMsg = '';
            const charName = currentScenario.aiCharacterName;
            if (currentPhase === 'icebreaker' && writeResult.newPhase === 'guided') {
              transitionMsg = `\n\n${charName} says: Great job with the vocabulary! Now let's practice the full conversation. ⟦これから会話の練習を始めましょう (kore kara kaiwa no renshuu o hajimemashou)⟧`;
            } else if (currentPhase === 'guided' && writeResult.newPhase === 'unguided') {
              transitionMsg = `\n\n${charName} says: Excellent progress! You're ready for full immersion. ⟦これからは日本語だけを使います (kore kara wa nihongo dake o tsukaimasu)⟧`;
            } else if (currentPhase === 'unguided' && writeResult.newPhase === 'evaluation') {
              transitionMsg = `\n\n${charName} says: The session is complete! Let me review how you did. ⟦セッションが終わりました。よくできました (sesshon ga owarimashita. yoku dekimashita)⟧`;
            }
            if (transitionMsg) {
              fullAiText += transitionMsg;
              send(JSON.stringify({ type: 'token', text: transitionMsg }));
            }
          }

          if (writeResult.isCelebration) {
            const celebrationMsg = `\n\n🎉 Congratulations! You've mastered this scenario! 🎉 ⟦おめでとうございます！このシナリオをマスターしました (omedetou gozaimasu! kono shinario o masutaa shimashita)⟧`;
            fullAiText += celebrationMsg;
            send(JSON.stringify({ type: 'token', text: celebrationMsg }));
          }

          const responseCorrections = currentPhase === 'unguided' ? [] : (correctionItems ?? []);

          // ── Send final event ──
          send(JSON.stringify({
            type: 'done',
            fullText: fullAiText,
            phase: writeResult.newPhase,
            runningScore: writeResult.runningScore,
            celebration: writeResult.isCelebration,
            analysis: {
              messageTarget: analysis.messageTarget,
              messageNative: analysis.messageNative,
              messageRomaji: analysis.messageRomaji,
              emotionTone: analysis.emotionTone,
              gestureHint: analysis.gestureHint,
              corrections: responseCorrections,
              suggestedReplies: analysis.suggestedReplies ?? [],
              scores: analysis.scores,
              feedback: analysis.feedback,
              goalsAddressedThisTurn: analysis.goalsAddressedThisTurn,
              scenarioComplete: writeResult.shouldComplete,
            },
          }));

          try { controller.close(); } catch {}
        } catch (err) {
          // Clean up pendingRetryCorrectionId on error to prevent stuck sessions
          try {
            await db.update(sessions).set({
              pendingRetryCorrectionId: null,
            }).where(and(
              eq(sessions.id, numericSessionId),
              sql`pending_retry_correction_id IS NOT NULL`
            ));
          } catch { /* non-critical cleanup */ }

          if (err instanceof AIQuotaError) {
            send(JSON.stringify({ type: 'error', code: 'quota', message: err.message }));
          } else if (err instanceof AIModelError) {
            send(JSON.stringify({ type: 'error', code: 'model', message: err.message }));
          } else if (err instanceof AIProviderError) {
            send(JSON.stringify({ type: 'error', code: 'provider', message: err.message }));
          } else {
            const msg = err instanceof Error ? err.message : 'Internal server error';
            send(JSON.stringify({ type: 'error', code: 'internal', message: msg }));
          }
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[STREAM CHAT] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
