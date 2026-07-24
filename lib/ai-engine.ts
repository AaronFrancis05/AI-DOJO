import { getTargetLangConfig, getNativeLangName } from './language';
import { getAIProvider } from './ai-providers';
import type { ChatTurn } from './ai-providers';

export interface CorrectionItem {
  correctionType: string;
  originalText: string;
  originalRomaji?: string | null;
  correctedText: string;
  correctedRomaji?: string | null;
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
  messageRomaji: string | null;
  isValidInContext: boolean;
  isEnglishWhenExpected: boolean;
  emotionTone?: string;
  gestureHint?: GestureHint;
  suggestedReplies?: string[];
  scores: {
    vocabulary: number;
    grammar: number;
    fluency: number;
    cultural: number;
    task: number;
  };
  feedback: string;
  corrections: CorrectionItem[];
  goalsAddressedThisTurn: number[];
  scenarioComplete: boolean;
}

export interface AIResponseAnalysis {
  messageTarget: string;
  messageNative: string;
  messageRomaji: string | null;
  isValidInContext: boolean;
  isEnglishWhenExpected: boolean;
  emotionTone?: string;
  gestureHint?: GestureHint;
  suggestedReplies?: string[];
  scores: {
    vocabulary: number;
    grammar: number;
    fluency: number;
    cultural: number;
    task: number;
  };
  feedback: string;
  corrections: CorrectionItem[];
  nextAiReply: {
    target: string;
    native: string;
    romaji: string | null;
    emotionTone?: string;
    gestureHint?: GestureHint;
  };
  goalsAddressedThisTurn: number[];
  scenarioComplete: boolean;
}

const TARGET_LANG_NAMES: Record<string, string> = {
  ja: 'Japanese',
  en: 'English',
};

const TARGET_LANG_NATIVE: Record<string, string> = {
  ja: '日本語',
  en: 'English',
};

export async function analyzeAndGenerateTurn(
  userInput: string,
  currentTurnNo: number,
  scenario: {
    id: number;
    context: string;
    learningGoals: string;
    aiCharacterName: string;
    aiCharacterRole: string;
    userCharacterName: string;
    userCharacterRole: string;
  },
  goals: Array<{
    id: number;
    sequenceOrder: number;
    goalText: string;
    goalType: string;
    targetPhrase: string | null;
  }>,
  completedGoalSequenceOrders: number[],
  conversationHistory: ChatTurn[] = [],
  behaviorMode?: string,
  situationContext?: string,
  situationLearningGoals?: string,
  targetLanguage: string = 'ja',
  nativeLanguage: string = 'en',
  isRetryOfPreviousMistake: boolean = false,
): Promise<AIResponseAnalysis> {

  const targetLangName = TARGET_LANG_NAMES[targetLanguage] ?? targetLanguage.toUpperCase();
  const nativeLangName = getNativeLangName(nativeLanguage);
  const targetCfg = getTargetLangConfig(targetLanguage);
  const hasRomaji = targetCfg.hasRomaji;

  const goalsBlock = goals.map(g => {
    const done = completedGoalSequenceOrders.includes(g.sequenceOrder);
    const status = done ? '[COVERED]' : '[PENDING]';
    const phrase = g.targetPhrase ? ` (target phrase: "${g.targetPhrase}")` : '';
    return `  ${status} Goal ${g.sequenceOrder} (${g.goalType}): ${g.goalText}${phrase}`;
  }).join('\n');

  const effectiveContext = situationContext ?? scenario.context;
  const effectiveGoals = situationLearningGoals ?? scenario.learningGoals;

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

  const correctionRomajiInstruction = hasRomaji
    ? `      "originalRomaji": "Romaji of originalText (Japanese only, else null)",\n      "correctedRomaji": "Romaji of correctedText (Japanese only, else null)",`
    : '';
  const romajiInstruction = hasRomaji
    ? `  - "romaji": "Romaji transcription of what the user said (only if target language is Japanese, otherwise null)"`
    : '';
  const aiRomajiInstruction = hasRomaji
    ? `    "romaji": "Romaji transcription of that AI response sentence (only if target language is Japanese, otherwise null)",`
    : '';

  const systemInstruction = `
You are an advanced backend AI processor engine handling a multi-turn ${targetLangName} language simulation game called "AI DOJO".

===== NARRATIVE CONTEXT =====
- Scenario context: ${effectiveContext}
- Learning goals: ${effectiveGoals}
- AI character you play: ${scenario.aiCharacterName} (${scenario.aiCharacterRole})
- The scenario has a placeholder user character named "${scenario.userCharacterName}" with role "${scenario.userCharacterRole}".

${modeInstruction}

${isRetryOfPreviousMistake
  ? `===== RETRY MODE: ACTIVE =====
The user is re-attempting a corrected sentence from the previous turn. If they still get it wrong or make a similar mistake this time, respond IN-CHARACTER and move the scene forward naturally — do NOT ask for a third attempt, do not repeat the correction, do not block the conversation. Acknowledge their effort briefly and continue the roleplay.`
  : ''}

IMPORTANT: The placeholder user character name ("${scenario.userCharacterName}") is a FICTIONAL NARRATIVE DEVICE used in the scenario description. The REAL user is a different person and will use their OWN real name, details, and phrasing. You must NEVER require the user to match the placeholder name or wording.

===== LANGUAGE RULES =====
- CONVERSATION STYLE: The AI character speaks primarily in ${nativeLangName} (the learner's native language), naturally code-switching key ${targetLangName} phrases into the dialogue. This mirrors how language learners actually acquire vocabulary — through contextual usage within a familiar linguistic framework.
- The ${targetLangName} elements should be high-value, contextual, and relevant to the scenario — greetings, set expressions, key vocabulary, or situational phrases embedded naturally in the ${nativeLangName} conversation. They are highlighted insertions, not full sentences.
- ALL TEACHING CONTENT — the "feedback" field, every "explanation" inside "corrections", and any coaching notes — MUST be written entirely in ${nativeLangName}, regardless of how advanced the learner is. This is scaffolding, not dialogue, and must never switch to ${targetLangName} even partially.
- The user is encouraged to attempt ${targetLangName} phrases alongside their ${nativeLangName}. Using only ${nativeLangName} is acceptable and should not be flagged as an error. If the user does attempt ${targetLangName}, praise their effort.
${hasRomaji ? '- Provide romaji transcription for Japanese target-language text (messageRomaji, nextAiReply.romaji, and correction romaji fields below).' : '- Romaji is NOT relevant for this language — always set romaji fields to null.'}

===== SCENARIO GOALS =====
${goalsBlock}

===== VALIDATION RULE =====
isValidInContext must be set to TRUE unless the user's input is genuinely off-topic or inconsistent with the SCENARIO SITUATION. Examples of what is VALID (isValidInContext = true):
- The user introduces themselves with their own real name instead of the placeholder name
- The user uses different phrasing, sentence structure, or vocabulary than the examples
- The user provides their own personal details that differ from the placeholder

Examples of what is INVALID (isValidInContext = false):
- The user tries to negotiate a hotel booking during a job interview scenario (wrong situation entirely)
- The user types nonsense or language that cannot be a response to the scenario
- The user explicitly says they are not participating or switches to an unrelated topic

===== isEnglishWhenExpected =====
Set isEnglishWhenExpected to true only if the user explicitly refuses to engage in the roleplay or writes unrelated content. Code-switching is expected behavior — the user may write purely in ${nativeLangName}, purely in ${targetLangName}, or a mix of both. None of these warrant isEnglishWhenExpected = true.

===== EMOTION TONE & GESTURE HINT =====
For each AI reply, optionally provide:
- emotionTone: the emotional tone of the AI's reply (e.g. "friendly", "concerned", "formal-polite", "surprised", "grateful", "apologetic")
- gestureHint: one of these exact values describing a physical gesture — "bow" | "wave" | "shake_hands" | "nod" | "none" (must match exactly, no free text). Choose "none" unless a clear gesture is implied by the dialogue context.

For the user's turn, optionally detect:
- emotionTone: the apparent tone of the user's input
- gestureHint: one of the same exact values ("bow" | "wave" | "shake_hands" | "nod" | "none")

===== AI CHARACTER BEHAVIOR =====
- Play ${scenario.aiCharacterName} (${scenario.aiCharacterRole}) consistently.
- If the user provides their own real name instead of "${scenario.userCharacterName}", accept it gracefully and use the user's actual stated name in your replies going forward. Treat this as fully correct behavior.
- If the user's input is genuinely off-situation (rare), gently redirect back to the scenario.
- Hold a natural, flowing conversation as the AI character. Do NOT rush to close. Each turn, check which goals remain [PENDING], and steer your next reply toward naturally drawing out the next uncovered goal through realistic dialogue — not by listing it mechanically. Only move toward a warm closing statement once all goals show [COVERED].

YOUR THREE JOBS:
1. EVALUATE: Analyze the user's input. Grade their performance integers out of the max scale ranges, translate it, provide custom feedback. Set isValidInContext based on the VALIDATION RULE above. Set isEnglishWhenExpected appropriately. Determine which scenario goals this turn addresses and list their sequenceOrder numbers in goalsAddressedThisTurn. If any errors are detected, populate the corrections array with structured correction objects.
2. CORRECT: If the user made a grammar, vocabulary, particle, verb conjugation, politeness level, or spelling error (in their ${targetLangName} attempt), add a structured correction object. If no corrections needed, return an empty array [].
3. RESPOND: Generate a dynamic context-aware response from the perspective of ${scenario.aiCharacterName}. Based on the goals, drive the conversation forward naturally.

===== SCENARIO COMPLETION RULE =====
Set scenarioComplete to true ONLY when ALL goals in the list above show [COVERED]. If even one goal remains [PENDING], scenarioComplete must be false.

Provide your response strictly as a single JSON object matching this schema blueprint:
{
  "messageTarget": "The ${targetLangName} phrase(s) the user produced — empty string if they used only ${nativeLangName}",
  "messageNative": "The user's full utterance (primarily ${nativeLangName}, may include code-switched ${targetLangName} phrases)",
  "messageRomaji": ${hasRomaji ? '"Romaji transcription (only for Japanese)"' : 'null'},
  "isValidInContext": true,
  "isEnglishWhenExpected": false,
  "emotionTone": "friendly",
  "gestureHint": "none",
  "suggestedReplies": ["2-3 short options in ${nativeLangName} the user might say next (can code-switch a ${targetLangName} phrase naturally)"],
  "scores": { "vocabulary": 0-30, "grammar": 0-25, "fluency": 0-20, "cultural": 0-15, "task": 0-10 },
  "feedback": "Constructive linguistic analysis coaching feedback targeted at the learner",
  "corrections": [
    {
      "correctionType": "grammar",
      "originalText": "example with error",
${correctionRomajiInstruction}      "correctedText": "corrected version",
      "explanation": "Explanation of the correction in ${nativeLangName}",
      "severity": "minor"
    }
  ],
  "nextAiReply": {
    "target": "The ${targetLangName} phrase(s) the AI character code-switches into this response — a word, expression, or phrase, or empty string if none",
    "native": "The AI character's full response (primarily ${nativeLangName} with code-switched ${targetLangName} phrases embedded)",
    "romaji": ${hasRomaji ? '"Romaji transcription (only for Japanese)"' : 'null'},
    "emotionTone": "formal-polite",
    "gestureHint": "bow"
  },
  "goalsAddressedThisTurn": [],
  "scenarioComplete": false
}
`;

  const userContent = `CURRENT GAME STATE:
- User typed raw string input: "${userInput}"
- This is Turn Number: ${currentTurnNo}
- Target language: ${targetLangName}
- Native language: ${nativeLangName}`;

  const provider = await getAIProvider();
  const rawText = await provider.generateJSON(systemInstruction, [
    ...conversationHistory,
    { role: 'user', content: userContent },
  ]);

  const parsed = JSON.parse(rawText) as AIResponseAnalysis;

  if (parsed.gestureHint) parsed.gestureHint = normalizeGesture(parsed.gestureHint);
  if (parsed.nextAiReply?.gestureHint) parsed.nextAiReply.gestureHint = normalizeGesture(parsed.nextAiReply.gestureHint);

  return parsed;
}

/**
 * Lightweight analysis for the streaming flow.
 * Evaluates the user's input without generating a new AI reply
 * (the reply text was already streamed to the client).
 *
 * Includes the pre-generated AI reply text as context so the model
 * can evaluate the user's input in relation to the full exchange.
 */
export async function analyzeUserTurn(
  userInput: string,
  aiReplyText: string,
  currentTurnNo: number,
  scenario: {
    id: number;
    context: string;
    learningGoals: string;
    aiCharacterName: string;
    aiCharacterRole: string;
    userCharacterName: string;
    userCharacterRole: string;
  },
  goals: Array<{
    id: number;
    sequenceOrder: number;
    goalText: string;
    goalType: string;
    targetPhrase: string | null;
  }>,
  completedGoalSequenceOrders: number[],
  conversationHistory: ChatTurn[] = [],
  behaviorMode?: string,
  situationContext?: string,
  situationLearningGoals?: string,
  targetLanguage: string = 'ja',
  nativeLanguage: string = 'en',
): Promise<UserTurnAnalysis> {
  const targetLangName = TARGET_LANG_NAMES[targetLanguage] ?? targetLanguage.toUpperCase();
  const nativeLangName = getNativeLangName(nativeLanguage);
  const targetCfg = getTargetLangConfig(targetLanguage);
  const hasRomaji = targetCfg.hasRomaji;

  const goalsBlock = goals.map(g => {
    const done = completedGoalSequenceOrders.includes(g.sequenceOrder);
    const status = done ? '[COVERED]' : '[PENDING]';
    const phrase = g.targetPhrase ? ` (target phrase: "${g.targetPhrase}")` : '';
    return `  ${status} Goal ${g.sequenceOrder} (${g.goalType}): ${g.goalText}${phrase}`;
  }).join('\n');

  const effectiveContext = situationContext ?? scenario.context;
  const effectiveGoals = situationLearningGoals ?? scenario.learningGoals;

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

  const correctionRomajiInstruction = hasRomaji
    ? `      "originalRomaji": "Romaji of originalText (Japanese only, else null)",\n      "correctedRomaji": "Romaji of correctedText (Japanese only, else null)",`
    : '';
  const romajiInstruction = hasRomaji
    ? `  - "romaji": "Romaji transcription of what the user said (only if target language is Japanese, otherwise null)"`
    : '';

  const systemInstruction = `
You are an advanced backend AI processor engine handling a multi-turn ${targetLangName} language simulation game called "AI DOJO".

===== NARRATIVE CONTEXT =====
- Scenario context: ${effectiveContext}
- Learning goals: ${effectiveGoals}
- AI character you play: ${scenario.aiCharacterName} (${scenario.aiCharacterRole})
- The scenario has a placeholder user character named "${scenario.userCharacterName}" with role "${scenario.userCharacterRole}".

${modeInstruction}

IMPORTANT: The placeholder user character name ("${scenario.userCharacterName}") is a FICTIONAL NARRATIVE DEVICE used in the scenario description. The REAL user is a different person and will use their OWN real name, details, and phrasing. You must NEVER require the user to match the placeholder name or wording.

===== LANGUAGE RULES =====
- The AI character replied in a code-switching style (primarily ${nativeLangName} with embedded ${targetLangName} phrases). Evaluate the user's input in that context.
- Code-switching is expected — the user may respond primarily in ${nativeLangName}, primarily in ${targetLangName}, or a mix. All are valid.
- ALL TEACHING CONTENT — the "feedback" field, every "explanation" inside "corrections", and any coaching notes — MUST be written entirely in ${nativeLangName}, regardless of how advanced the learner is.
- messageNative should contain the user's full utterance. messageTarget should contain only the ${targetLangName} phrase(s) the user produced, or empty string if none.
${hasRomaji ? '- Provide romaji transcription for Japanese target-language text (messageRomaji and correction romaji fields below).' : '- Romaji is NOT relevant for this language — always set romaji fields to null.'}

===== SCENARIO GOALS =====
${goalsBlock}

===== VALIDATION RULE =====
isValidInContext must be set to TRUE unless the user's input is genuinely off-topic or inconsistent with the SCENARIO SITUATION.

===== isEnglishWhenExpected =====
Set isEnglishWhenExpected to true only if the user explicitly refuses to engage in the roleplay or writes unrelated content. Code-switching is expected — using only ${nativeLangName} is acceptable.

===== EMOTION TONE & GESTURE HINT =====
For the user's turn, optionally detect:
- emotionTone: the apparent tone of the user's input
- gestureHint: one of these exact values — "bow" | "wave" | "shake_hands" | "nod" | "none"

YOUR JOBS:
1. EVALUATE: Analyze the user's input. Grade their performance integers out of the max scale ranges, translate it, provide custom feedback. Set isValidInContext. Set isEnglishWhenExpected appropriately. Determine which scenario goals this turn addresses.
2. CORRECT: If the user made any errors, add structured correction objects. If no corrections needed, return an empty array [].

===== SCENARIO COMPLETION RULE =====
Set scenarioComplete to true ONLY when ALL goals show [COVERED]. If even one goal remains [PENDING], scenarioComplete must be false.

Provide your response strictly as a single JSON object matching this schema blueprint:
{
  "messageTarget": "The ${targetLangName} phrase(s) the user produced — empty string if they used only ${nativeLangName}",
  "messageNative": "The user's full utterance (primarily ${nativeLangName}, may include code-switched ${targetLangName} phrases)",
  "messageRomaji": ${hasRomaji ? '"Romaji transcription (only for Japanese)"' : 'null'},
  "isValidInContext": true,
  "isEnglishWhenExpected": false,
  "emotionTone": "friendly",
  "gestureHint": "none",
  "suggestedReplies": ["2-3 short options in ${nativeLangName} the user might say next (can code-switch a ${targetLangName} phrase naturally)"],
  "scores": { "vocabulary": 0-30, "grammar": 0-25, "fluency": 0-20, "cultural": 0-15, "task": 0-10 },
  "feedback": "Constructive linguistic analysis coaching feedback targeted at the learner",
  "corrections": [
    {
      "correctionType": "grammar",
      "originalText": "example with error",
${correctionRomajiInstruction}      "correctedText": "corrected version",
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
  ]);

  const parsed = JSON.parse(rawText) as UserTurnAnalysis & { nextAiReply?: unknown };

  if (parsed.gestureHint) parsed.gestureHint = normalizeGesture(parsed.gestureHint);

  return {
    messageTarget: parsed.messageTarget,
    messageNative: parsed.messageNative,
    messageRomaji: parsed.messageRomaji,
    isValidInContext: parsed.isValidInContext,
    isEnglishWhenExpected: parsed.isEnglishWhenExpected,
    emotionTone: parsed.emotionTone,
    gestureHint: parsed.gestureHint,
    suggestedReplies: parsed.suggestedReplies,
    scores: parsed.scores,
    feedback: parsed.feedback,
    corrections: parsed.corrections,
    goalsAddressedThisTurn: parsed.goalsAddressedThisTurn,
    scenarioComplete: parsed.scenarioComplete,
  };
}
