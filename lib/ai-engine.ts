import { getTargetLangConfig, getNativeLangName, getGreetingGesture, TARGET_LANGUAGES, DEFAULT_TARGET_LANGUAGE } from './language';
// Imported from the leaf modules rather than the prompts barrel: the barrel
// pulls in the phase builders, and nothing here needs them.
import { describeReplyContract } from './roleplay/prompts/reply-contract';
import { buildIdentityAndGuardBlock } from './roleplay/prompts/shared';
import type { SessionPhase } from './roleplay/phase-engine';
import { getDifficultyTierDescription, getAppropriatenessRubric, getPronunciationFocus } from './language-packs';
import { getAIProvider } from './ai-providers';
import type { AIUsage, ChatTurn } from './ai-providers';
import { SCORE_DIMENSIONS, type TurnScores } from './roleplay/score-dimensions';

export interface CorrectionItem {
  correctionType: string;
  originalText: string;
  originalPhonetic?: string | null;
  correctedText: string;
  correctedPhonetic?: string | null;
  explanation: string;
  severity: string;
}

/** @deprecated kept only so old imports don't break; use ChatTurn from ./ai-providers instead */
export type GeminiMessage = ChatTurn;

/** Allowed gesture values that map to animation clips */
export const ALLOWED_GESTURES = ['bow', 'wave', 'shake_hands', 'nod', 'none'] as const;
export type GestureHint = typeof ALLOWED_GESTURES[number];

export function normalizeGesture(val: unknown): GestureHint {
  if (typeof val === 'string' && (ALLOWED_GESTURES as readonly string[]).includes(val)) {
    return val as GestureHint;
  }
  return 'none';
}

/**
 * Lightweight analysis result — everything except `nextAiReply`
 * (the reply text is pre-generated via streaming).
 */
export interface UserTurnAnalysis {
  messageTarget: string;
  messageNative: string;
  messagePhonetic: string | null;
  isValidInContext: boolean;
  isEnglishWhenExpected: boolean;
  emotionTone?: string;
  gestureHint?: GestureHint;
  suggestedReplies?: string[];
  /** Every dimension independently scaled 0-100 — see SCORE_DIMENSIONS. */
  scores: TurnScores;
  feedback: string;
  corrections: CorrectionItem[];
  goalsAddressedThisTurn: number[];
  scenarioComplete: boolean;
}

// Defined in a dependency-free module so client components can import the
// list without pulling this file, and every provider SDK, into the browser
// bundle. Re-exported here for the server-side callers.
export { SCORE_DIMENSIONS, type ScoreDimension, type TurnScores } from './roleplay/score-dimensions';

/**
 * Shared prompt text so the two prompts below cannot drift apart on scale.
 *
 * Exported because the AI examiner grades a whole interview on the same six
 * dimensions (see lib/interview/grade.ts). A second copy of this wording is
 * exactly how the 0-25/0-100 conflation documented above got in.
 */
export const SCORING_INSTRUCTION = `Grade the learner on each of these six dimensions INDEPENDENTLY, as an integer from 0 to 100, where 0 means "no evidence at all" and 100 means "indistinguishable from a competent speaker in this situation". These are six separate percentages — they are NOT parts of a shared budget and they do NOT need to sum to anything:
  - vocabulary: range and accuracy of the words/phrases they reached for
  - grammar: structural correctness of what they produced
  - fluency: flow, hesitation, and naturalness of delivery
  - cultural: register, politeness level, and situational appropriateness
  - task: how far this turn advanced the actual goal of the scenario
  - expressionAppropriateness: whether the expression chosen fits this specific context
Judge against what is reasonable for this learner's stated difficulty level, not against a native speaker.`;

export const SCORES_SCHEMA_LINE = `  "scores": { "vocabulary": 0-100, "grammar": 0-100, "fluency": 0-100, "cultural": 0-100, "task": 0-100, "expressionAppropriateness": 0-100 },`;

/**
 * Coerces a model-supplied score object into six integers in [0, 100].
 *
 * Defends the persisted score columns against a malformed or out-of-range
 * model response — a missing dimension, a string, or a stale 0-25 style value
 * would otherwise be written straight into `sessions`/`evaluations` and skew
 * the learner's running average for the rest of the session.
 */
export function normalizeScores(raw: unknown): TurnScores {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = {} as TurnScores;

  for (const dimension of SCORE_DIMENSIONS) {
    const value = Number(source[dimension]);
    out[dimension] = Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.round(value)))
      : 0;
  }

  return out;
}

/**
 * Looked up per call, not snapshotted into a module-level map: the catalogue is
 * hydrated from the `languages` table after this module is imported, so a map
 * built at import time would never contain an admin-added language and the
 * prompt would name it by its bare code.
 */
function resolveTargetLangName(code: string): string {
  return TARGET_LANGUAGES.find(l => l.code === code)?.name ?? code.toUpperCase();
}

/**
 * Lightweight analysis for the streaming flow.
 * Evaluates the user's input without generating a new AI reply
 * (the reply text was already streamed to the client).
 *
 * Includes the pre-generated AI reply text as context so the model
 * can evaluate the user's input in relation to the full exchange.
 */
export interface AnalyzeUserTurnInput {
  userInput: string;
  aiReplyText: string;
  currentTurnNo: number;
  scenario: {
    id: number;
    context: string;
    learningGoals: string;
    aiCharacterName: string;
    aiCharacterRole: string;
    userCharacterName: string;
    userCharacterRole: string;
    difficulty?: string;
  };
  goals: Array<{
    id: number;
    sequenceOrder: number;
    goalText: string;
    goalType: string;
    targetPhrase: string | null;
  }>;
  completedGoalSequenceOrders: number[];
  conversationHistory?: ChatTurn[];
  behaviorMode?: string;
  situationContext?: string;
  situationLearningGoals?: string;
  targetLanguage?: string;
  nativeLanguage?: string;
  learnerName?: string;
  learnerCountry?: string | null;
  /** Session phase the graded reply was generated in — decides the reply contract. */
  phase: SessionPhase;
  /** True when target and native language match (no ⟦ ⟧ delimiters are used). */
  isSameLanguage: boolean;
  /** Receives the analysis call's token counts, for the ai_usage ledger. */
  onUsage?: (usage: AIUsage) => void;
}

export async function analyzeUserTurn(input: AnalyzeUserTurnInput): Promise<UserTurnAnalysis> {
  const {
    userInput,
    aiReplyText,
    currentTurnNo,
    scenario,
    goals,
    completedGoalSequenceOrders,
    conversationHistory = [],
    behaviorMode,
    situationContext,
    situationLearningGoals,
    targetLanguage = DEFAULT_TARGET_LANGUAGE,
    nativeLanguage = 'en',
    learnerName,
    learnerCountry,
    phase,
    isSameLanguage,
    onUsage,
  } = input;

  const targetLangName = resolveTargetLangName(targetLanguage);
  const nativeLangName = getNativeLangName(nativeLanguage);
  const targetCfg = getTargetLangConfig(targetLanguage);
  const hasPhonetic = targetCfg.hasPhonetic;
  const gestureGuidance = getGreetingGesture(targetLanguage) === 'bow'
    ? `In ${targetLangName} culture the greeting, the thank-you and the apology are all a bow, so prefer "bow" over "wave" and over "shake_hands" for those. `
    : '';

  const goalsBlock = goals.map(g => {
    const done = completedGoalSequenceOrders.includes(g.sequenceOrder);
    const status = done ? '[COVERED]' : '[PENDING]';
    const phrase = g.targetPhrase ? ` (target phrase: "${g.targetPhrase}")` : '';
    return `  ${status} Goal ${g.sequenceOrder} (${g.goalType}): ${g.goalText}${phrase}`;
  }).join('\n');

  const effectiveContext = situationContext ?? scenario.context;
  const effectiveGoals = situationLearningGoals ?? scenario.learningGoals;
  const difficulty = scenario.difficulty ?? 'beginner';
  const difficultyDesc = getDifficultyTierDescription(difficulty, targetLanguage);
  const appropriatenessRubric = getAppropriatenessRubric(targetLanguage);
  const pronunciationFocus = getPronunciationFocus(targetLanguage, nativeLanguage);

  const modeInstruction = behaviorMode === 'trouble'
    ? `===== BEHAVIOR MODE: TROUBLE =====
The AI character should be MORE DIFFICULT to deal with. They should:
- Be less cooperative and create obstacles for the user
- Use more complex vocabulary and expressions as appropriate for the target language
- Occasionally misunderstand the user or ask for clarification
- Challenge the user's requests more than in standard mode
- Maintain an appropriately polite but firm demeanor throughout
This mode is designed to push the user's language skills further by simulating real-world difficult interactions.`
    : `===== BEHAVIOR MODE: STANDARD =====
The AI character should be cooperative, friendly, and helpful. They should:
- Respond clearly and at the appropriate difficulty level
- Guide the conversation naturally toward completing all goals
- Be patient with the learner's language level
- Provide a supportive learning environment`;

  const correctionPhoneticInstruction = hasPhonetic
    ? `      "originalPhonetic": "Romanized phonetic of originalText, else null",\n      "correctedPhonetic": "Romanized phonetic of correctedText, else null",`
    : '';

  const learnerIdentityBlock = buildIdentityAndGuardBlock(learnerName, learnerCountry);

  const systemInstruction = `
You are an experienced ${targetLangName} tutor, assessing one turn a learner just took in a role-play practice session.

Grade the way a good tutor grades: against what this learner can reasonably manage at their stated level, and against what this specific moment in the scene actually asked of them — not against a native speaker, and not by applying a rubric blindly. Be generous about effort and strict about whether they could be understood.

===== NARRATIVE CONTEXT =====
- Scenario context: ${effectiveContext}
- Learning goals: ${effectiveGoals}
- AI character you play: ${scenario.aiCharacterName} (${scenario.aiCharacterRole})
- The scenario has a placeholder user character named "${scenario.userCharacterName}" with role "${scenario.userCharacterRole}".
${learnerIdentityBlock}

${modeInstruction}

===== DIFFICULTY LEVEL =====
The learner's current difficulty level is: ${difficulty}. Follow these guidelines:
${difficultyDesc}

IMPORTANT: The placeholder user character name ("${scenario.userCharacterName}") is a FICTIONAL NARRATIVE DEVICE used in the scenario description. The REAL user is a different person and will use their OWN real name, details, and phrasing. You must NEVER require the user to match the placeholder name or wording.

===== SESSION PHASE: ${phase.toUpperCase()} =====
${describeReplyContract(phase, isSameLanguage, targetLangName, nativeLangName)}
- ALL TEACHING CONTENT — the "feedback" field, every "explanation" inside "corrections", and any coaching notes — MUST be written entirely in ${nativeLangName}, regardless of how advanced the learner is.
- Grade the learner against what this phase actually asks of them. Do not penalise them for not doing something the phase never invited.
${hasPhonetic ? `- Provide a romanized phonetic transcription of ${targetLangName} text (messagePhonetic and correction phonetic fields below).` : '- Phonetic is NOT relevant for this language — always set phonetic fields to null.'}

===== SCENARIO GOALS =====
${goalsBlock}

===== VALIDATION RULE =====
isValidInContext must be set to TRUE unless the user's input is genuinely off-topic or inconsistent with the SCENARIO SITUATION.

===== isEnglishWhenExpected =====
${phase === 'unguided'
  ? `This is the full-immersion phase, so ${targetLangName} genuinely is expected. Set isEnglishWhenExpected to true if the learner abandoned ${targetLangName} entirely and answered wholly in ${nativeLangName}, or refused to participate. A learner who attempts ${targetLangName} and only reaches for ${nativeLangName} to fill a gap is trying — leave it false.`
  : `Set isEnglishWhenExpected to true ONLY if the learner explicitly refuses to engage or writes unrelated content. In this phase mixing languages is expected and answering only in ${nativeLangName} is perfectly acceptable — neither warrants true.`}

===== EMOTION TONE & GESTURE HINT =====
- emotionTone: the apparent tone of the user's input.
- gestureHint: the gesture ${scenario.aiCharacterName} should make on their NEXT line — not the learner's. It drives the 3D character's body, so it must describe what the character does, and it is applied to the reply that follows this turn. One of these exact values — "bow" | "wave" | "shake_hands" | "nod" | "none". ${gestureGuidance}Choose "none" unless the dialogue clearly implies a gesture.

YOUR JOBS:
1. EVALUATE: Analyze the user's input, translate it, and provide custom feedback. ${SCORING_INSTRUCTION} Set isValidInContext. Set isEnglishWhenExpected appropriately. Determine which scenario goals this turn addresses.
2. CORRECT: If the user made any errors, add structured correction objects. If no corrections needed, return an empty array [].

===== EXPRESSION APPROPRIATENESS RUBRIC =====
${appropriatenessRubric}
${pronunciationFocus ? `\n===== PRONUNCIATION FOCUS =====\n${pronunciationFocus}\n` : ''}
===== SCENARIO COMPLETION RULE =====
Set scenarioComplete to true ONLY when ALL goals show [COVERED]. If even one goal remains [PENDING], scenarioComplete must be false.

Provide your response strictly as a single JSON object matching this schema blueprint:
{
  "messageTarget": "The ${targetLangName} phrase(s) the user produced — empty string if they used only ${nativeLangName}",
  "messageNative": "The user's full utterance (primarily ${nativeLangName}, may include code-switched ${targetLangName} phrases)",
  "messagePhonetic": ${hasPhonetic ? '"Romanized phonetic transcription of message"' : 'null'},
  "isValidInContext": true,
  "isEnglishWhenExpected": false,
  "emotionTone": "friendly",
  "gestureHint": "none",
  "suggestedReplies": ["2-3 short options in ${nativeLangName} the user might say next (can code-switch a ${targetLangName} phrase naturally)"],
${SCORES_SCHEMA_LINE}
  "feedback": "Constructive linguistic analysis coaching feedback targeted at the learner",
  "corrections": [
    {
      "correctionType": "grammar",
      "originalText": "example with error",
${correctionPhoneticInstruction}      "correctedText": "corrected version",
      "explanation": "Explanation of the correction in ${nativeLangName}",
      "severity": "minor"
    }
  ],
  "goalsAddressedThisTurn": [],
  "scenarioComplete": false
}
`;

  const userContent = `CURRENT GAME STATE:
- User typed raw string input: "${userInput}"
- AI character just replied with: "${aiReplyText}"
- This is Turn Number: ${currentTurnNo}
- Target language: ${targetLangName}
- Native language: ${nativeLangName}`;

  const provider = await getAIProvider();
  const rawText = await provider.generateJSON(systemInstruction, [
    ...conversationHistory,
    { role: 'assistant', content: aiReplyText },
    { role: 'user', content: userContent },
  ], { onUsage });

  const parsed = JSON.parse(rawText) as UserTurnAnalysis & { nextAiReply?: unknown };

  if (parsed.gestureHint) parsed.gestureHint = normalizeGesture(parsed.gestureHint);

  return {
    messageTarget: parsed.messageTarget,
    messageNative: parsed.messageNative,
    messagePhonetic: parsed.messagePhonetic,
    isValidInContext: parsed.isValidInContext,
    isEnglishWhenExpected: parsed.isEnglishWhenExpected,
    emotionTone: parsed.emotionTone,
    gestureHint: parsed.gestureHint,
    suggestedReplies: parsed.suggestedReplies,
    scores: normalizeScores(parsed.scores),
    feedback: parsed.feedback,
    corrections: parsed.corrections,
    goalsAddressedThisTurn: parsed.goalsAddressedThisTurn,
    scenarioComplete: parsed.scenarioComplete,
  };
}
