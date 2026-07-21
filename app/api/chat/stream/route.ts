import { db } from '../../../../src/db';
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
): Promise<void> {
  try {
    await db.insert(audioJobs).values({
      conversationId,
      sessionId,
      text,
      lang,
      phase,
      speaker,
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
      content: row.messageTarget ?? row.messageJp,
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
          vocabRows.map((v, i) => `  ${i + 1}. "${v.japanese}" (${v.romaji ?? ''}) = "${v.english}"`).join('\n')
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
- You have exactly ${vocabRows.length} vocabulary word(s) to cover. Do NOT introduce more than this.
- ALWAYS begin by greeting the student in ${nativeLangName} and explaining what the scenario is about, using the title and setting above.
- Introduce each vocabulary word in the context of the scenario — explain how the word fits into the situation the student will face.
- For each word: say the ${targetLangName} word (with romaji in parentheses), then clearly say its ${nativeLangName} meaning.
- After introducing a word, ask the student to repeat it back to you.
- Keep your tone encouraging and supportive — the student is a beginner.
- Use a mix of ${nativeLangName} for explanations and ${targetLangName} (with romaji) for the vocabulary itself.
- Do NOT cover multiple words at once. One word per turn.
- After the student attempts a word, give brief feedback in ${nativeLangName} on their attempt, then introduce the next word.
- Mark the vocabulary word you are currently teaching by saying "【VOCAB N】" at the start of your teaching turn, where N is the word number (1-based).
- IMPORTANT: If the student's input is empty (session start), give a warm greeting and start teaching word 1.
- CRITICAL: Never teach vocabulary unrelated to this scenario. Stay on-topic.

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

    const streamSystemPrompt = currentPhase === 'icebreaker' ? icebreakerRules : currentPhase === 'guided' ? guidedRules : unguidedRules;

    const streamUserMsg = isSessionStart
      ? `[SESSION START] The student is ready to begin. This is the first turn.`
      : `[Turn ${currentTurnNo}] The student says: "${effectiveInput}"`;

    // ── Build SSE response stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
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

          // Validate ⟦ ⟧ delimiter usage and fix if needed
          const targetBcp47 = getBCP47(targetLanguage, 'tts');
          const nativeBcp47 = getBCP47(nativeLanguage, 'tts');
          const validation = validateDelimiters(fullAiText, targetBcp47, nativeBcp47);
          if (!validation.valid) {
            console.warn('[SPAN VALIDATOR] delimiter issues:', validation.issues);
            // Strip any text that looks like target-language outside delimiters
            // to prevent TTS from mispronouncing it
          }

          // Phase 2: Analyze the user's turn (skip for session start greeting)
          if (isSessionStart) {
            // Save AI greeting turn without analysis
            const [aiConversation] = await db.insert(conversations).values({
              sessionId: numericSessionId,
              turnNo: currentTurnNo,
              speaker: 'ai',
              messageTarget: fullAiText,
              messageNative: '',
              messageJp: fullAiText,
              messageRomaji: null,
              messageEn: '',
              isValidInContext: true,
            }).returning({ id: conversations.id });

            if (aiConversation) {
              enqueueAudioJob(
                aiConversation.id,
                numericSessionId,
                fullAiText,
                targetBcp47,
                currentPhase,
                'ai',
              );
            }

            const icebreakerDone = currentPhase === 'icebreaker' && vocabRows.length > 0
              ? conversationRows.filter(c => c.speaker === 'user').length >= vocabRows.length
              : false;
            const newPhase = nextPhase(currentPhase, { icebreakerDone, allGoalsCovered: false });

            await db.update(sessions).set({
              phase: newPhase,
              totalTurns: currentTurnNo,
            }).where(eq(sessions.id, numericSessionId));

            send(JSON.stringify({
              type: 'done',
              fullText: fullAiText,
              phase: newPhase,
              analysis: { corrections: [], suggestedReplies: [] },
            }));
            controller.close();
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

          if (currentPhase === 'guided' && hasCorrections) {
            const prevPendingId = session.pendingRetryCorrectionId;

            if (prevPendingId && isRetryOfPreviousMistake) {
              if (prevPendingId) {
                await db.update(corrections).set({
                  isFinalAttempt: true,
                }).where(eq(corrections.id, prevPendingId));
              }
              await db.update(sessions).set({
                pendingRetryCorrectionId: null,
              }).where(eq(sessions.id, numericSessionId));
            } else if (!prevPendingId) {
              const validCorrections = correctionItems.filter(c => c.correctedText);
              if (validCorrections.length > 0) {
                const [userConversation] = await db.insert(conversations).values({
                  sessionId: numericSessionId,
                  turnNo: currentTurnNo,
                  speaker: 'user',
                  messageTarget: analysis.messageTarget,
                  messageNative: analysis.messageNative,
                  messageJp: targetLanguage === 'ja' ? analysis.messageTarget : (analysis.messageTarget ?? userRawInput),
                  messageRomaji: analysis.messageRomaji,
                  messageEn: analysis.messageNative,
                  emotionTone: analysis.emotionTone ?? null,
                  gestureHint: analysis.gestureHint ?? null,
                }).returning({ id: conversations.id });

                const inserted = await db.insert(corrections).values(
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

                pendingRetryCorrectionId = inserted[0]?.id ?? null;
                if (pendingRetryCorrectionId) {
                  await db.update(sessions).set({
                    pendingRetryCorrectionId,
                  }).where(eq(sessions.id, numericSessionId));
                }
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
              controller.close();
              return;
            }
          }

          // ── Save user and AI turns ──
          const [userConversation] = await db.insert(conversations).values({
            sessionId: numericSessionId,
            turnNo: currentTurnNo,
            speaker: 'user',
            messageTarget: analysis.messageTarget,
            messageNative: analysis.messageNative,
            messageJp: targetLanguage === 'ja' ? analysis.messageTarget : (analysis.messageTarget ?? userRawInput),
            messageRomaji: analysis.messageRomaji,
            messageEn: analysis.messageNative,
            emotionTone: analysis.emotionTone ?? null,
            gestureHint: analysis.gestureHint ?? null,
          }).returning({ id: conversations.id });

          // Insert corrections (non-retry)
          if (hasCorrections) {
            const validCorrections = correctionItems.filter(c => c.correctedText);
            if (validCorrections.length > 0) {
              await db.insert(corrections).values(
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

          const [aiConversation] = await db.insert(conversations).values({
            sessionId: numericSessionId,
            turnNo: currentTurnNo,
            speaker: 'ai',
            messageTarget: fullAiText,
            messageNative: '',
            messageJp: fullAiText,
            messageRomaji: null,
            messageEn: '',
            isValidInContext: true,
          }).returning({ id: conversations.id });

          if (aiConversation) {
            enqueueAudioJob(
              aiConversation.id,
              numericSessionId,
              fullAiText,
              targetBcp47,
              currentPhase,
              'ai',
            );
          }

          // ── Goal completions ──
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
              await db.insert(goalCompletions).values(completionRows);
            }
          }

          // ── Running score deduction (unguided) ──
          let runningScore = session.runningScore;
          if (currentPhase === 'unguided' && hasCorrections) {
            runningScore -= correctionItems.filter(c => c.correctedText).length * UNGUIDED_MISTAKE_PENALTY;
            if (analysis.isEnglishWhenExpected) {
              runningScore -= UNGUIDED_ENGLISH_PENALTY;
            }
            if (runningScore < 0) runningScore = 0;
          }

          const goalsCompleted = analysis.goalsAddressedThisTurn?.filter(
            seqOrder => !completedSequenceOrders.includes(seqOrder)
          ).length ?? 0;
          const totalGoalsNow = completedSequenceOrders.length + goalsCompleted;
          const allGoalsCovered = totalGoalsNow >= goals.length;

          const icebreakerDone = currentPhase === 'icebreaker' && vocabRows.length > 0
            ? conversationRows.filter(c => c.speaker === 'user').length >= vocabRows.length
            : false;
          const newPhase = nextPhase(currentPhase, {
            icebreakerDone,
            allGoalsCovered,
          });
          const shouldComplete = analysis.scenarioComplete || currentTurnNo >= SAFETY_CAP_TURN;

          // ── Score accumulation ──
          const currentVocabScore = session.vocabularyScore ?? 0;
          const currentGrammarScore = session.grammarScore ?? 0;
          const currentFluencyScore = session.fluencyScore ?? 0;
          const currentCulturalScore = session.culturalScore ?? 0;
          const currentTaskScore = session.taskScore ?? 0;

          const scoredTurnsCount = Math.max(1, Math.floor((conversationRows.filter(c => c.speaker === 'user').length) + 1));

          const blendedVocab = Math.round(((currentVocabScore * (scoredTurnsCount - 1)) + analysis.scores.vocabulary) / scoredTurnsCount);
          const blendedGrammar = Math.round(((currentGrammarScore * (scoredTurnsCount - 1)) + analysis.scores.grammar) / scoredTurnsCount);
          const blendedFluency = Math.round(((currentFluencyScore * (scoredTurnsCount - 1)) + analysis.scores.fluency) / scoredTurnsCount);
          const blendedCultural = Math.round(((currentCulturalScore * (scoredTurnsCount - 1)) + analysis.scores.cultural) / scoredTurnsCount);
          const blendedTask = Math.round(((currentTaskScore * (scoredTurnsCount - 1)) + analysis.scores.task) / scoredTurnsCount);

          const updateData: Record<string, unknown> = {
            totalTurns: currentTurnNo,
            runningScore,
            phase: shouldComplete ? 'completed' : newPhase,
            vocabularyScore: blendedVocab,
            grammarScore: blendedGrammar,
            fluencyScore: blendedFluency,
            culturalScore: blendedCultural,
            taskScore: blendedTask,
          };

          if (shouldComplete) {
            updateData.status = 'completed';
            updateData.completedAt = new Date();
            updateData.feedback = analysis.feedback;
          }

          await db.update(sessions).set(updateData).where(eq(sessions.id, numericSessionId));

          const responseCorrections = currentPhase === 'unguided' ? [] : (correctionItems ?? []);

          // ── Evaluation + XP (on completion) ──
          if (shouldComplete) {
            const [icebreakerStats] = await db
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
            const finalFluencyScore = Math.round((blendedFluency + runningScore) / 2);
            const finalTaskScore = Math.round((blendedTask + runningScore) / 2);

            await db.insert(evaluations).values({
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

            const [userRow] = await db.select({
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

              await db.update(users).set({
                xp: newXp, level: newLevel, xpToNext: newXpToNext,
                streak: newStreak, lastActiveDate: today,
              }).where(eq(users.id, user.id));
            }
          }

          // ── Send final event ──
          send(JSON.stringify({
            type: 'done',
            fullText: fullAiText,
            phase: newPhase,
            runningScore,
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
              scenarioComplete: shouldComplete,
            },
          }));

          controller.close();
        } catch (err) {
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
          controller.close();
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
