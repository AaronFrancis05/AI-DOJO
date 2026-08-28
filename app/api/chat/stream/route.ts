import { db } from '../../../../src/db';
import { withSessionLock } from '../../../../src/db-pool';
import { sessions, conversations, corrections, evaluations, goalCompletions, lessons, users, vocabularyEncounters, srsCards } from '../../../../src/schema';
import { analyzeTurn, loadSessionTurnData } from '../../../../lib/roleplay/analyze-turn';
import { getAIProvider, AIProviderError, AIQuotaError, AIModelError } from '../../../../lib/ai-providers';
import { getTargetLangConfig, getNativeLangName, getBCP47 } from '../../../../lib/language';
import {
  advancePhaseState,
  computeCompositeScore,
  PRONUNCIATION_PASS_THRESHOLD,
  PASSING_SCORE_THRESHOLD,
  STALL_THRESHOLD,
  SAFETY_CAP_TURN,
  UNGUIDED_MISTAKE_PENALTY,
  UNGUIDED_ENGLISH_PENALTY,
  type PhaseStep,
} from '../../../../lib/roleplay/phase-engine';
import { buildEvaluationSummary } from '../../../../lib/roleplay/evaluation-summary';
import { recordLessonActivity } from '../../../../lib/curriculum/lesson-progress';
import { eq, and, sql } from 'drizzle-orm';
import { getAuthUser } from '../../../../lib/auth/server';
import { validateDelimiters } from '../../../../lib/roleplay/lang-detect';
import { sanitizeStreamedChunk, createStreamTextSanitizer, parseVocabMarker } from '../../../../lib/roleplay/stream-sanitizer';
import { userAttemptsVocabWord } from '../../../../lib/roleplay/vocab-match';
import { inferGesture } from '../../../../lib/roleplay/gesture';
import {
  buildTurnSystemPrompt,
  buildTurnUserMessage,
  icebreakerPhrase,
  displayVocab,
  sameLangWordLine,
  type TurnPromptContext,
} from '../../../../lib/roleplay/prompts';

/* ── Note on server-side audio ──────────────────────────────────────────
   Every AI turn used to be queued to `audio_jobs` and synthesized a SECOND
   time by the Inngest worker, which stored the result as a base64 `data:`
   URL in `conversations.audio_url` — hundreds of KB per turn, in a Postgres
   column, that nothing ever played. The learner's audio has always come
   from the client speaking the reply directly (lib/roleplay/tts.ts).

   The second of the two enqueue sites also never dispatched its Inngest
   event, so those rows were written and then sat 'pending' forever.

   The enqueue calls are removed here. The `audioJobs` table and the
   processAudio worker are intentionally left in place but dormant: dropping
   them is a destructive schema change, and if per-turn audio is ever wanted
   for session-report replay it should write to blob storage rather than to
   a DB column.
   ────────────────────────────────────────────────────────────────────── */

/* ── Note on prompts ────────────────────────────────────────────────────
   The per-phase prompts used to live inline in this file — six near-
   duplicate variants totalling several hundred lines — while a second,
   contradictory set lived in lib/ai-engine.ts. They drifted, and the
   analyzer ended up grading replies against a format no phase produced.

   They now live in lib/roleplay/prompts/, which both generation (here) and
   analysis (via describeReplyContract) build from. This route is left as
   orchestration: load → stream → analyze → persist → transition.
   ────────────────────────────────────────────────────────────────────── */

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
    const accuracyScore = typeof body.accuracyScore === 'number' ? body.accuracyScore : null;
    const responseTimeMs = typeof body.responseTimeMs === 'number' ? body.responseTimeMs : null;

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

    if (session.status === 'completed') {
      return Response.json({ error: 'Session is already completed' }, { status: 400 });
    }

    const turnData = await loadSessionTurnData(session);
    const currentScenario = turnData.scenario;
    const situationResult = turnData.situation;
    const goals = turnData.goals;
    const completedSequenceOrders = turnData.completedSequenceOrders;
    const conversationHistory = turnData.conversationHistory;
    const currentTurnNo = turnData.currentTurnNo;
    const vocabRows = turnData.vocabRows;
    const behaviorMode = turnData.behaviorMode;
    const targetLanguage = turnData.targetLanguage;
    const nativeLanguage = turnData.nativeLanguage;
    const isSameLanguage = turnData.isSameLanguage;
    const currentPhase = turnData.currentPhase;
    // Which beat of the phase this turn is. A session created before the
    // phase_step column existed reads as 'open', which is the safe default:
    // the character re-introduces the stage it is already in rather than
    // skipping straight to concluding one it never opened.
    const currentPhaseStep = (session.phaseStep ?? 'open') as PhaseStep;

    if (!currentScenario) {
      return Response.json({ error: 'Scenario not found' }, { status: 404 });
    }

    let situationContext = currentScenario.context;
    let situationLearningGoals = currentScenario.learningGoals;
    if (situationResult && !turnData.scenarioLocalized) {
      situationContext = situationResult.context;
      situationLearningGoals = situationResult.learningGoals;
    }

    const targetLangName = getTargetLangConfig(targetLanguage).name;
    const nativeLangName = getNativeLangName(nativeLanguage);

    const isSessionStart = userRawInput === '__session_start__';
    const effectiveInput = isSessionStart ? '' : userRawInput;

    // ── Icebreaker vocab-word tracking (code-enforced, not prompt-only) ──
    // icebreakerVocabIndex is the 1-based word currently being taught;
    // icebreakerVocabAttempts counts how many teaching turns have been spent
    // on it. Both are authoritative — the AI's "【VOCAB N】" marker only
    // updates them after being parsed back out of its own response below.
    const hasNoVocab = vocabRows.length === 0;
    const currentVocabIndex = session.icebreakerVocabIndex ?? 1;
    const currentVocabAttempts = session.icebreakerVocabAttempts ?? 0;
    const isIcebreakerExhausted = currentPhase === 'icebreaker'
      && !isSessionStart
      && currentVocabIndex > vocabRows.length;

    // The learner gets exactly one retry per word (two teaching turns total).
    // Once that ceiling is hit, don't give the model another chance to loop —
    // deterministically advance to the next word ourselves.
    const shouldForceAdvanceVocab = currentPhase === 'icebreaker'
      && !isSessionStart
      && !isIcebreakerExhausted
      && !hasNoVocab
      && currentVocabAttempts >= 2;
    const forcedNextVocabRow = shouldForceAdvanceVocab ? vocabRows[currentVocabIndex] : undefined;

    // Deterministic signal for the icebreaker phase: did the learner's last
    // message already contain the word we are currently teaching? When true we
    // steer the model to move on, and (after analysis below) advance the index
    // ourselves instead of trusting a "【VOCAB N】" marker the model might re-emit
    // to loop back. For cross-language lessons only the target-language word /
    // romaji counts — repeating the native meaning is not "saying the word".
    const currentVocabRow = (currentPhase === 'icebreaker' && !isSessionStart && currentVocabIndex <= vocabRows.length)
      ? vocabRows[currentVocabIndex - 1]
      : undefined;
    const userProducedCurrentWord = !!currentVocabRow && userAttemptsVocabWord(
      effectiveInput,
      {
        targetText: currentVocabRow.targetText,
        phonetic: currentVocabRow.phonetic,
        translation: isSameLanguage ? currentVocabRow.translation : '',
      },
      targetLanguage,
    );

    // The base `phonetic` column stores Japanese romaji. Once vocab is
    // The base `phonetic` column stores Japanese romaji. Once vocab is
    // localized into a non-Japanese target language that romaji is wrong, so
    // only surface phonetics for genuinely Japanese-target lessons.
    const showPhonetic = getTargetLangConfig(targetLanguage).hasPhonetic && targetLanguage === 'ja';

    const scenarioTitle = turnData.scenarioLocalized
      ? currentScenario.title
      : (situationResult?.title ?? currentScenario.title);

    // The debrief has to speak real numbers, so its opening beat — and only
    // that beat — is handed the session's scorecard. Building it costs three
    // extra reads, which is why it is gated rather than always loaded.
    const evaluationSummary = (currentPhase === 'evaluation' && currentPhaseStep !== 'closing')
      ? await buildEvaluationSummary({
          sessionId: numericSessionId,
          scores: {
            vocabularyScore: session.vocabularyScore ?? 0,
            grammarScore: session.grammarScore ?? 0,
            fluencyScore: session.fluencyScore ?? 0,
            culturalScore: session.culturalScore ?? 0,
            taskScore: session.taskScore ?? 0,
            expressionAppropriatenessScore: session.expressionAppropriatenessScore ?? 0,
          },
          goalsCovered: completedSequenceOrders.length,
          goalsTotal: goals.length,
        })
      : undefined;

    const lessonTitle = session.lessonId
      ? (await db.select({ title: lessons.title }).from(lessons).where(eq(lessons.id, session.lessonId)))[0]?.title ?? null
      : null;

    // Everything the phase prompts need, assembled once. See
    // lib/roleplay/prompts/ for the builders that consume it.
    const promptCtx: TurnPromptContext = {
      phase: currentPhase,
      phaseStep: currentPhaseStep,
      isSameLanguage,
      isSessionStart,
      targetLangName,
      nativeLangName,
      showPhonetic,
      scenarioTitle,
      situationContext,
      situationLearningGoals,
      aiCharacterName: currentScenario.aiCharacterName,
      aiCharacterRole: currentScenario.aiCharacterRole,
      learnerName: turnData.learnerName,
      learnerCountry: turnData.learnerCountry,
      behaviorMode,
      difficulty: turnData.effectiveDifficulty,
      vocab: vocabRows,
      goals,
      completedSequenceOrders,
      currentVocabIndex,
      userProducedCurrentWord,
      evaluation: evaluationSummary,
      lessonTitle,
    };

    // Deterministically hands off to the next word when we bypass generation
    // (see shouldForceAdvanceVocab above). This text goes straight to the
    // learner rather than through the model, so it must already be phrased in
    // the right language: entirely in targetLanguage for a same-language
    // lesson, or native-language connectives around a ⟦ ⟧-wrapped
    // target-language word for a cross-language one.
    const forcedAdvanceLang = isSameLanguage ? targetLanguage : nativeLanguage;
    const buildWordIntro = (v: (typeof vocabRows)[number]) => isSameLanguage
      ? `${icebreakerPhrase(forcedAdvanceLang, 'newWord')} ${sameLangWordLine(v, promptCtx)} ${icebreakerPhrase(forcedAdvanceLang, 'tryIt')}`
      : `${icebreakerPhrase(forcedAdvanceLang, 'newWord')} ⟦${displayVocab(v, promptCtx)}⟧ — ${icebreakerPhrase(forcedAdvanceLang, 'means')} "${v.translation}". ${icebreakerPhrase(forcedAdvanceLang, 'tryIt')} ⟦${displayVocab(v, promptCtx)}⟧`;
    const forcedAdvanceMessage = !shouldForceAdvanceVocab
      ? null
      : forcedNextVocabRow
        ? `${icebreakerPhrase(forcedAdvanceLang, 'ack')} 【VOCAB ${currentVocabIndex + 1}】 ${buildWordIntro(forcedNextVocabRow)}`
        // Already on the last word — no next word to hand off to. Emit a
        // one-past-the-end marker so the index-based icebreakerDone check
        // below still advances the phase instead of looping forever.
        : `${icebreakerPhrase(forcedAdvanceLang, 'ack')} 【VOCAB ${currentVocabIndex + 1}】 ${icebreakerPhrase(forcedAdvanceLang, 'allDone')}`;

    const streamSystemPrompt = buildTurnSystemPrompt(promptCtx);
    const streamUserMsg = buildTurnUserMessage(promptCtx, effectiveInput, currentTurnNo);

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
          const streamSanitizer = createStreamTextSanitizer();

          // Phase 1: Stream the AI reply text
          if (forcedAdvanceMessage) {
            // The learner already used their one retry on this word. Don't
            // give the model a chance to ask a third time — hand off to the
            // next word ourselves so the loop can't recur.
            fullAiText = forcedAdvanceMessage;
            const text = streamSanitizer.push(fullAiText) + streamSanitizer.flush();
            if (text) send(JSON.stringify({ type: 'token', text }));
          } else {
            for await (const chunk of provider.generateStream(streamSystemPrompt, [
              ...conversationHistory,
              { role: 'user', content: streamUserMsg },
            ])) {
              fullAiText += chunk;
              const delta = streamSanitizer.push(chunk);
              if (delta) send(JSON.stringify({ type: 'token', text: delta }));
            }
          }

          if (!fullAiText.trim()) {
            fullAiText = `I understand. Please continue with the conversation.`;
            const text = streamSanitizer.push(fullAiText) + streamSanitizer.flush();
            if (text) send(JSON.stringify({ type: 'token', text }));
          } else {
            const tail = streamSanitizer.flush();
            if (tail) send(JSON.stringify({ type: 'token', text: tail }));
          }

          // Let the client start TTS as soon as the reply text is ready,
          // without waiting for the analysis/phase-transition round-trips.
          const sanitizedReply = sanitizeStreamedChunk(fullAiText);
          send(JSON.stringify({ type: 'text_done', fullText: sanitizedReply }));

          // Immediately after, and deliberately not on `done`: the analysis
          // that carries the model's own gestureHint takes seconds, by which
          // time the character is already mid-greeting. A bow has to land with
          // the word, so the obvious cases are read straight off the reply and
          // sent now. The model's hint still arrives on `done` and refines the
          // turns this can't call.
          const earlyGesture = inferGesture(sanitizedReply, targetLanguage);
          if (earlyGesture !== 'none') {
            send(JSON.stringify({ type: 'gesture', gesture: earlyGesture }));
          }

          // Keep icebreakerVocabIndex/Attempts authoritative instead of trusting
          // the model to self-track: advance state directly when we forced the
          // turn ourselves, otherwise validate the "【VOCAB N】" marker the model
          // was asked to emit before trusting it to move the index.
          let newVocabIndex = currentVocabIndex;
          let newVocabAttempts = currentVocabAttempts;
          // The encounter to record for the word we are moving off, if any.
          // Nothing in this streaming flow ever wrote `vocabulary_encounters`
          // — only the legacy /api/sessions/[id]/icebreaker drill route did.
          // Two things depended on that data and silently got nothing:
          // the icebreakerPassRate blended into the final vocabulary score
          // (see below), and the words that should feed the review queue.
          let vocabEncounter: { vocabularyId: number; usedCorrectly: boolean; attemptNumber: number } | null = null;
          if (currentPhase === 'icebreaker') {
            if (shouldForceAdvanceVocab) {
              // We authored fullAiText ourselves (forcedAdvanceMessage) — advance
              // state directly instead of round-tripping through the marker regex.
              newVocabIndex = currentVocabIndex + 1;
              newVocabAttempts = newVocabIndex <= vocabRows.length ? 1 : 0;
              // Forced advance means they used up both attempts without
              // producing it cleanly.
              if (currentVocabRow) {
                vocabEncounter = {
                  vocabularyId: currentVocabRow.id,
                  usedCorrectly: false,
                  attemptNumber: currentVocabAttempts,
                };
              }
            } else if (userProducedCurrentWord) {
              // The learner's last message already contained the current word, so
              // they've produced it. Advance deterministically instead of waiting
              // for the model to re-emit a "【VOCAB N+1】" marker — and if the model
              // still loops back and repeats the same word, the next turn starts
              // on the new index so the loop can't recur. If the analyzer below
              // flags a real error on this turn, the retry gate returns early and
              // this advance is never persisted.
              newVocabIndex = currentVocabIndex + 1;
              newVocabAttempts = newVocabIndex <= vocabRows.length ? 1 : 0;
              if (currentVocabRow) {
                vocabEncounter = {
                  vocabularyId: currentVocabRow.id,
                  usedCorrectly: true,
                  attemptNumber: Math.max(1, currentVocabAttempts),
                };
              }
            } else {
              // Only trust a marker that matches the current word or steps to the
              // very next one; a missing, malformed, or out-of-range value (e.g. the
              // model hallucinating "【VOCAB 999】" or skipping ahead) can't be used to
              // update the authoritative index, but must still count as a turn spent
              // on the current word so the retry ceiling above still gets hit.
              const parsedIndex = parseVocabMarker(fullAiText);
              if (parsedIndex === currentVocabIndex) {
                newVocabAttempts = currentVocabAttempts + 1;
              } else if (parsedIndex === currentVocabIndex + 1 && parsedIndex <= vocabRows.length) {
                newVocabIndex = parsedIndex;
                newVocabAttempts = 1;
                // The model moved on of its own accord, which it is told to do
                // once the learner has produced the word acceptably.
                if (currentVocabRow) {
                  vocabEncounter = {
                    vocabularyId: currentVocabRow.id,
                    usedCorrectly: true,
                    attemptNumber: Math.max(1, currentVocabAttempts),
                  };
                }
              } else {
                newVocabAttempts = currentVocabAttempts + 1;
              }
            }
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
            const { newPhase: sessionStartPhase, phaseChanged } = await withSessionLock(numericSessionId, async (tx) => {
              const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
              if (freshSession.status === 'completed') throw new Error('Session was completed by another request');

              const existingGreeting = await tx.select({ id: conversations.id })
                .from(conversations)
                .where(and(
                  eq(conversations.sessionId, numericSessionId),
                  eq(conversations.turnNo, currentTurnNo)
                ))
                .limit(1);
              if (existingGreeting.length > 0) throw new Error('Session start already processed');

              await tx.insert(conversations).values({
                sessionId: numericSessionId,
                turnNo: currentTurnNo,
                speaker: 'ai',
                messageTarget: fullAiText,
                messageNative: '',
                messagePhonetic: null,
                isValidInContext: true,
              });

              const icebreakerDoneInner = currentPhase === 'icebreaker'
                ? (vocabRows.length > 0 ? newVocabIndex > vocabRows.length : true)
                : false;
              const advanced = advancePhaseState(
                { phase: currentPhase, step: currentPhaseStep },
                { icebreakerDone: icebreakerDoneInner, allGoalsCovered: false },
              );

              await tx.update(sessions).set({
                phase: advanced.phase,
                phaseStep: advanced.step,
                totalTurns: currentTurnNo,
                status: 'active',
                lastActiveAt: new Date(),
                stalledTurnCount: 0,
                icebreakerVocabIndex: newVocabIndex,
                icebreakerVocabAttempts: newVocabAttempts,
              }).where(eq(sessions.id, numericSessionId));

              return { newPhase: advanced.phase, phaseChanged: advanced.phase !== currentPhase };
            });

            if (phaseChanged) {
              send(JSON.stringify({
                type: 'phase_transition',
                fromPhase: currentPhase,
                toPhase: sessionStartPhase,
                message: '',
              }));
            }

            send(JSON.stringify({
              type: 'done',
              fullText: sanitizeStreamedChunk(fullAiText),
              phase: sessionStartPhase,
              analysis: { corrections: [], suggestedReplies: [] },
            }));
            try { controller.close(); } catch {}
            return;
          }

          const analysis = await analyzeTurn({
            userInput: userRawInput,
            aiReplyText: fullAiText,
            scenario: currentScenario,
            data: turnData,
          });

          const correctionItems = analysis.corrections ?? [];
          const hasLowPronunciation = accuracyScore !== null && accuracyScore < PRONUNCIATION_PASS_THRESHOLD;
          if (hasLowPronunciation && !correctionItems.some(c => c.correctionType === 'pronunciation')) {
            correctionItems.unshift({
              correctionType: 'pronunciation',
              originalText: userRawInput,
              correctedText: userRawInput,
              explanation: `Pronunciation score was ${accuracyScore}% (target: ${PRONUNCIATION_PASS_THRESHOLD}%+). Let's practice saying this once more.`,
              severity: 'minor',
            });
          }
          const hasCorrections = (correctionItems.length > 0 && correctionItems.some(c => c.correctedText)) || hasLowPronunciation;

          // ── Phase-agnostic retry gate (bounded to exactly 1 retry) ──
          let pendingRetryCorrectionId: number | null = null;
          let retryEarlyExit = false;

          // Orientation predates any target-language production, and the
          // debrief and farewell come after the scene has ended — holding the
          // learner back for a retry in any of them would stall the session on
          // a turn that has nothing left to practise.
          const retryablePhase = currentPhase !== 'orientation'
            && currentPhase !== 'evaluation'
            && currentPhase !== 'completed';

          if (hasCorrections && retryablePhase) {
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
                  lastActiveAt: new Date(),
                }).where(eq(sessions.id, numericSessionId));
              });
            } else if (!prevPendingId && !isRetryOfPreviousMistake) {
              const validCorrections = correctionItems.filter(c => c.correctedText);
              if (validCorrections.length > 0) {
                const { newPendingRetryId, userConvId } = await withSessionLock(numericSessionId, async (tx) => {
                  const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
                  if (freshSession.status === 'completed') throw new Error('Session was completed by another request');

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
                    messagePhonetic: analysis.messagePhonetic,
                    emotionTone: analysis.emotionTone ?? null,
                    gestureHint: analysis.gestureHint ?? null,
                    responseTimeMs,
                  }).returning({ id: conversations.id });

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

                  const newPendingId = inserted[0]?.id ?? null;

                  // A turn can correctly address a goal / produce the current
                  // vocab word AND separately contain an unrelated correctable
                  // mistake. Without this, that progress was silently dropped
                  // when this branch returns early below — completedSequenceOrders
                  // and icebreakerVocabIndex would never reflect it, so the
                  // already-mastered goal/word gets re-taught on a later turn.
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
                        evidenceNote: `Addressed in turn ${currentTurnNo}: "${userRawInput.substring(0, 80)}"`,
                      }));
                    if (completionRows.length > 0) {
                      await tx.insert(goalCompletions).values(completionRows);
                    }
                  }

                  // Same reason as the goal rows above: this branch advances
                  // icebreakerVocabIndex/Attempts, so the encounter that drove
                  // that advance has to be recorded here too — otherwise the
                  // word counts as taught with no evidence row behind it.
                  if (vocabEncounter) {
                    await tx.insert(vocabularyEncounters).values({
                      sessionId: numericSessionId,
                      conversationId: userConversation.id,
                      vocabularyId: vocabEncounter.vocabularyId,
                      usedCorrectly: vocabEncounter.usedCorrectly,
                      attemptNumber: vocabEncounter.attemptNumber,
                      phase: 'icebreaker',
                    });
                  }

                  const sessionUpdate: Record<string, unknown> = {
                    pendingRetryCorrectionId: newPendingId,
                    lastActiveAt: new Date(),
                  };
                  if (currentPhase === 'icebreaker') {
                    sessionUpdate.icebreakerVocabIndex = newVocabIndex;
                    sessionUpdate.icebreakerVocabAttempts = newVocabAttempts;
                  }
                  await tx.update(sessions).set(sessionUpdate).where(eq(sessions.id, numericSessionId));

                  return { newPendingRetryId: newPendingId, userConvId: userConversation.id };
                });

                pendingRetryCorrectionId = newPendingRetryId;
              }

              send(JSON.stringify({
                type: 'retry',
                analysis: {
                  messageTarget: analysis.messageTarget,
                  messageNative: analysis.messageNative,
                  messagePhonetic: analysis.messagePhonetic,
                  emotionTone: analysis.emotionTone,
                  gestureHint: analysis.gestureHint,
                  corrections: correctionItems.map(c => ({
                    ...c,
                    originalPhonetic: c.originalPhonetic ?? null,
                    correctedPhonetic: c.correctedPhonetic ?? null,
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
            if (freshSession.status === 'completed') throw new Error('Session was completed by another request');

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
              messagePhonetic: analysis.messagePhonetic,
              emotionTone: analysis.emotionTone ?? null,
              gestureHint: analysis.gestureHint ?? null,
              responseTimeMs,
            }).returning({ id: conversations.id });

            if (hasCorrections) {
              const validCorrections = correctionItems.filter(c => c.correctedText);
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

            if (vocabEncounter) {
              await tx.insert(vocabularyEncounters).values({
                sessionId: numericSessionId,
                conversationId: userConversation.id,
                vocabularyId: vocabEncounter.vocabularyId,
                usedCorrectly: vocabEncounter.usedCorrectly,
                attemptNumber: vocabEncounter.attemptNumber,
                phase: 'icebreaker',
              });
            }

            const [aiConversation] = await tx.insert(conversations).values({
              sessionId: numericSessionId,
              turnNo: currentTurnNo,
              speaker: 'ai',
              messageTarget: fullAiText,
              messageNative: '',
              messagePhonetic: null,
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
            const newStalledTurnCount = goalsCompleted > 0 ? 0 : ((freshSession.stalledTurnCount ?? 0) + 1);
            const isStalled = (currentPhase === 'guided' || currentPhase === 'unguided')
              && newStalledTurnCount >= STALL_THRESHOLD;
            const isSafetyCapped = currentTurnNo >= SAFETY_CAP_TURN;
            const totalGoalsNow = completedSequenceOrders.length + goalsCompleted;
            const allGoalsCoveredInner = isStalled || isSafetyCapped || totalGoalsNow >= goals.length;

            const icebreakerDoneInner = currentPhase === 'icebreaker'
              // The safety cap has to release the icebreaker too, or a session
              // that somehow stalls in the drill sits there past the cap with
              // nothing else able to move it on.
              ? (isSafetyCapped || (vocabRows.length > 0 ? newVocabIndex > vocabRows.length : true))
              : false;

            // One pure function owns the whole lifecycle — which beat of the
            // phase comes next, and whether the phase itself advances. See
            // advancePhaseState in lib/roleplay/phase-engine.ts.
            const advanced = advancePhaseState(
              { phase: currentPhase, step: currentPhaseStep },
              { icebreakerDone: icebreakerDoneInner, allGoalsCovered: allGoalsCoveredInner },
            );
            const newPhaseInner = advanced.phase;
            const newPhaseStepInner = advanced.step;

            // A session ends when — and only when — the debrief has been
            // delivered AND its farewell has been spoken, i.e. when the phase
            // machine walks out of `evaluation`.
            //
            // `analysis.scenarioComplete` used to end the session from any
            // phase past the icebreaker, so the model calling the scene done
            // on the very first unguided turn fired the celebration with no
            // evaluation and no goodbye. It is deliberately NOT consulted here
            // any more: goal coverage is counted deterministically from
            // `goal_completions`, and the stall threshold and safety cap
            // already guarantee every session reaches its debrief.
            const shouldCompleteInner = newPhaseInner === 'completed';

            let newPhaseTurnCount = freshPhaseTurnCount;
            if (newPhaseInner !== currentPhase) {
              newPhaseTurnCount = 0;
            } else {
              newPhaseTurnCount++;
            }

            const isCelebrationInner = shouldCompleteInner;

            const currentVocabScore = freshSession.vocabularyScore ?? 0;
            const currentGrammarScore = freshSession.grammarScore ?? 0;
            const currentFluencyScore = freshSession.fluencyScore ?? 0;
            const currentCulturalScore = freshSession.culturalScore ?? 0;
            const currentTaskScore = freshSession.taskScore ?? 0;
            const currentExpressionScore = freshSession.expressionAppropriatenessScore ?? 0;

            const scoredTurnsCount = Math.max(1, Math.floor((turnData.userTurnCount) + 1));

            const blendedVocab = Math.round(((currentVocabScore * (scoredTurnsCount - 1)) + analysis.scores.vocabulary) / scoredTurnsCount);
            const blendedGrammar = Math.round(((currentGrammarScore * (scoredTurnsCount - 1)) + analysis.scores.grammar) / scoredTurnsCount);
            const blendedFluency = Math.round(((currentFluencyScore * (scoredTurnsCount - 1)) + analysis.scores.fluency) / scoredTurnsCount);
            const blendedCultural = Math.round(((currentCulturalScore * (scoredTurnsCount - 1)) + analysis.scores.cultural) / scoredTurnsCount);
            const blendedTask = Math.round(((currentTaskScore * (scoredTurnsCount - 1)) + analysis.scores.task) / scoredTurnsCount);
            const blendedExpression = Math.round(((currentExpressionScore * (scoredTurnsCount - 1)) + analysis.scores.expressionAppropriateness) / scoredTurnsCount);

            const updateData: Record<string, unknown> = {
              totalTurns: currentTurnNo,
              phaseTurnCount: newPhaseTurnCount,
              stalledTurnCount: newStalledTurnCount,
              lastActiveAt: new Date(),
              runningScore: runningScoreInner,
              phase: newPhaseInner,
              phaseStep: newPhaseStepInner,
              icebreakerVocabIndex: newVocabIndex,
              icebreakerVocabAttempts: newVocabAttempts,
              vocabularyScore: blendedVocab,
              grammarScore: blendedGrammar,
              fluencyScore: blendedFluency,
              culturalScore: blendedCultural,
              taskScore: blendedTask,
              expressionAppropriatenessScore: blendedExpression,
            };

            if (shouldCompleteInner) {
              updateData.status = 'completed';
              updateData.completedAt = new Date();
              updateData.feedback = analysis.feedback;
            }

            if (freshSession.status === 'paused' && !shouldCompleteInner) {
              updateData.status = 'active';
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

              // Blend the drill result into the vocabulary score ONLY when the
              // drill actually produced data. Averaging against a hardcoded 0
              // for a session with no recorded encounters silently halved the
              // learner's vocabulary score — which, until encounters started
              // being written above, was every streaming session.
              const icebreakerTotal = icebreakerStats?.total ?? 0;
              const finalVocabScore = icebreakerTotal > 0
                ? Math.round((blendedVocab + Math.round((icebreakerStats.passed / icebreakerTotal) * 100)) / 2)
                : blendedVocab;
              const finalFluencyScore = Math.round((blendedFluency + runningScoreInner) / 2);
              const finalTaskScore = Math.round((blendedTask + runningScoreInner) / 2);

              const compositeScore = computeCompositeScore('completed', {
                vocabularyScore: finalVocabScore,
                grammarScore: blendedGrammar,
                fluencyScore: finalFluencyScore,
                culturalScore: blendedCultural,
                taskScore: finalTaskScore,
                expressionAppropriatenessScore: blendedExpression,
              });
              const isPassed = compositeScore >= PASSING_SCORE_THRESHOLD;
              const celebrationVariant: 'scenario-mastery' | 'needs-practice' = isPassed ? 'scenario-mastery' : 'needs-practice';

              // Every word met in this session enters the spaced-repetition
              // queue. Card seeding previously lived only in
              // recordLessonActivity, so it fired for curriculum lessons and
              // never for a freeform session — meaning most practice produced
              // nothing to review later. onConflictDoNothing keeps an existing
              // card's schedule intact rather than resetting it.
              const practisedVocabIds = vocabRows.map(v => v.id);
              if (practisedVocabIds.length > 0) {
                await tx.insert(srsCards)
                  .values(practisedVocabIds.map(vocabularyId => ({ userId: user.id, vocabularyId })))
                  .onConflictDoNothing();
              }

              await tx.insert(evaluations).values({
                sessionId: numericSessionId,
                vocabularyScore: finalVocabScore,
                grammarScore: blendedGrammar,
                fluencyScore: finalFluencyScore,
                culturalScore: blendedCultural,
                taskScore: finalTaskScore,
                expressionAppropriatenessScore: blendedExpression,
                feedback: analysis.feedback,
              });

              const totalScore = finalVocabScore + blendedGrammar + finalFluencyScore + blendedCultural + finalTaskScore + blendedExpression;
              const xpGained = Math.round(totalScore * 2.5 + 25);
              let newStreak: number | null = null;

              const [userRow] = await tx.select({
                xp: users.xp, streak: users.streak, lastActiveDate: users.lastActiveDate,
              }).from(users).where(eq(users.id, user.id));

              if (userRow) {
                const today = new Date().toISOString().slice(0, 10);
                const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                let streak = userRow.streak;
                if (userRow.lastActiveDate === today) {
                  // same day
                } else if (userRow.lastActiveDate === yesterday) {
                  streak += 1;
                } else {
                  streak = 1;
                }
                newStreak = streak;

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

              return {
                newPhase: newPhaseInner,
                runningScore: runningScoreInner,
                isCelebration: isCelebrationInner || shouldCompleteInner,
                celebrationVariant,
                compositeScore,
                passed: isPassed,
                xpGained,
                newStreak,
                aiConversationId: aiConversation?.id ?? null,
                shouldComplete: shouldCompleteInner,
                lessonId: freshSession.lessonId,
              };
            }

            return {
              newPhase: newPhaseInner,
              runningScore: runningScoreInner,
              isCelebration: isCelebrationInner,
              celebrationVariant: 'scenario-mastery' as const,
              compositeScore: 0,
              passed: false,
              xpGained: null as number | null,
              newStreak: null as number | null,
              aiConversationId: aiConversation?.id ?? null,
              shouldComplete: shouldCompleteInner,
              lessonId: freshSession.lessonId,
            };
          });

          // ── Phase transition broadcast ──
          //
          // Announcement only — nothing is appended to the reply. This block
          // used to make a second LLM call for a hand-off line and then do
          // `fullAiText += appended`, which is why one message could conclude
          // the vocabulary drill, open the scene AND announce the switch to
          // full immersion. The stage that is starting now introduces itself
          // on its own next turn (see phaseOpeningDirective), and the client
          // renders the card from `toPhase` via PHASE_META.
          if (writeResult.newPhase !== currentPhase) {
            send(JSON.stringify({
              type: 'phase_transition',
              fromPhase: currentPhase,
              toPhase: writeResult.newPhase,
              message: '',
            }));
          }

          // A curriculum lesson is only credited here, on a real finish. This
          // used to run exclusively from PATCH /api/sessions/[id], which the
          // client sends when the learner *leaves* a session — so playing a
          // lesson all the way through never recorded it and never unlocked
          // the next one. recordLessonActivity is idempotent (isFirstCompletion),
          // so the PATCH path can stay for abandonment without double-counting.
          if (writeResult.shouldComplete && writeResult.lessonId) {
            try {
              await recordLessonActivity({
                userId: user.id,
                lessonId: writeResult.lessonId,
                phaseKey: 'review',
                complete: true,
                score: writeResult.compositeScore,
                targetLanguage,
                nativeLanguage,
              });
            } catch (err) {
              // Never fail the learner's turn over progress bookkeeping.
              console.error('[STREAM CHAT] failed to record lesson progress', {
                sessionId: numericSessionId,
                lessonId: writeResult.lessonId,
                error: String(err),
              });
            }
          }

          const responseCorrections = currentPhase === 'unguided' ? [] : (correctionItems ?? []);

          // ── Send final event ──
          send(JSON.stringify({
            type: 'done',
            fullText: sanitizeStreamedChunk(fullAiText),
            phase: writeResult.newPhase,
            runningScore: writeResult.runningScore,
            celebration: writeResult.isCelebration,
            celebrationVariant: writeResult.celebrationVariant,
            compositeScore: writeResult.compositeScore,
            passed: writeResult.passed,
            xpGained: writeResult.xpGained,
            newStreak: writeResult.newStreak,
            analysis: {
              messageTarget: analysis.messageTarget,
              messageNative: analysis.messageNative,
              messagePhonetic: analysis.messagePhonetic,
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
        // `no-transform` and `X-Accel-Buffering` stop an intermediary (the
        // nginx in front of the container, a CDN) from holding tokens back and
        // releasing them in bursts. The client speaks each sentence as it
        // arrives, so buffered delivery reaches the learner as stalls in the
        // middle of a reply even though the model streamed it smoothly.
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[STREAM CHAT] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
