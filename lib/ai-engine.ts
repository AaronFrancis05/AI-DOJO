import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import { getTargetLangConfig, getNativeLangName } from './language';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is missing from your environment variables (.env)');
}

const ai = new GoogleGenAI({ apiKey: apiKey });

export interface CorrectionItem {
  correctionType: string;
  originalText: string;
  correctedText: string;
  explanation: string;
  severity: string;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface AIResponseAnalysis {
  messageTarget: string;
  messageNative: string;
  messageRomaji: string | null;
  isValidInContext: boolean;
  isEnglishWhenExpected: boolean;
  emotionTone?: string;
  gestureHint?: string;
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
    gestureHint?: string;
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
    targetPhraseJp: string | null;
  }>,
  completedGoalSequenceOrders: number[],
  conversationHistory: GeminiMessage[] = [],
  behaviorMode?: string,
  situationContext?: string,
  situationLearningGoals?: string,
  targetLanguage: string = 'ja',
  nativeLanguage: string = 'en',
): Promise<AIResponseAnalysis> {

  const targetLangName = TARGET_LANG_NAMES[targetLanguage] ?? targetLanguage.toUpperCase();
  const nativeLangName = getNativeLangName(nativeLanguage);
  const targetCfg = getTargetLangConfig(targetLanguage);
  const hasRomaji = targetCfg.hasRomaji;

  const goalsBlock = goals.map(g => {
    const done = completedGoalSequenceOrders.includes(g.sequenceOrder);
    const status = done ? '[COVERED]' : '[PENDING]';
    const phrase = g.targetPhraseJp ? ` (target phrase: "${g.targetPhraseJp}")` : '';
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

IMPORTANT: The placeholder user character name ("${scenario.userCharacterName}") is a FICTIONAL NARRATIVE DEVICE used in the scenario description. The REAL user is a different person and will use their OWN real name, details, and phrasing. You must NEVER require the user to match the placeholder name or wording.

===== LANGUAGE RULES =====
- The conversation MUST be conducted in ${targetLangName}.
- The AI character must speak in ${targetLangName}.
- The user's input should ideally be in ${targetLangName}. If they use ${nativeLangName}, flag it.
- Provide a ${nativeLangName} translation of each turn.
${hasRomaji ? '- Provide romaji transcription for Japanese text.\n- Romaji is only relevant when target language is Japanese.' : '- Romaji is NOT relevant for this language — always set messageRomaji to null.'}

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
Set isEnglishWhenExpected to true if the user typed in ${nativeLangName} when the scenario and preceding conversation clearly expected ${targetLangName}. Set to false if they used ${targetLangName} or if ${nativeLangName} was appropriate for context.

===== EMOTION TONE & GESTURE HINT =====
For each AI reply, optionally provide:
- emotionTone: the emotional tone of the AI's reply (e.g. "friendly", "concerned", "formal-polite", "surprised", "grateful", "apologetic")
- gestureHint: a brief physical gesture description (e.g. "slight bow", "checks watch", "smiles warmly", "nods while speaking") — null if none implied

For the user's turn, optionally detect:
- emotionTone: the apparent tone of the user's input
- gestureHint: any gesture implied by the content

===== AI CHARACTER BEHAVIOR =====
- Play ${scenario.aiCharacterName} (${scenario.aiCharacterRole}) consistently.
- If the user provides their own real name instead of "${scenario.userCharacterName}", accept it gracefully and use the user's actual stated name in your replies going forward. Treat this as fully correct behavior.
- If the user's input is genuinely off-situation (rare), gently redirect back to the scenario.
- Hold a natural, flowing conversation as the AI character. Do NOT rush to close. Each turn, check which goals remain [PENDING], and steer your next reply toward naturally drawing out the next uncovered goal through realistic dialogue — not by listing it mechanically. Only move toward a warm closing statement once all goals show [COVERED].

YOUR THREE JOBS:
1. EVALUATE: Analyze the user's input. Grade their performance integers out of the max scale ranges, translate it, provide custom feedback. Set isValidInContext based on the VALIDATION RULE above. Set isEnglishWhenExpected appropriately. Determine which scenario goals this turn addresses and list their sequenceOrder numbers in goalsAddressedThisTurn. If any errors are detected, populate the corrections array with structured correction objects.
2. CORRECT: If the user made a grammar, vocabulary, particle, verb conjugation, politeness level, or spelling error, add a structured correction object. If they wrote in ${nativeLangName} (isEnglishWhenExpected), add a correction with type "wrong_language". If no corrections needed, return an empty array [].
3. RESPOND: Generate a dynamic context-aware response from the perspective of ${scenario.aiCharacterName}. Based on the goals, drive the conversation forward naturally.

===== SCENARIO COMPLETION RULE =====
Set scenarioComplete to true ONLY when ALL goals in the list above show [COVERED]. If even one goal remains [PENDING], scenarioComplete must be false.

Provide your response strictly as a single JSON object matching this schema blueprint:
{
  "messageTarget": "What the user said in ${targetLangName} (transcribed/cleaned)",
  "messageNative": "${nativeLangName} translation of what the user said",
  "messageRomaji": ${hasRomaji ? '"Romaji transcription (only for Japanese)"' : 'null'},
  "isValidInContext": true,
  "isEnglishWhenExpected": false,
  "emotionTone": "friendly",
  "gestureHint": null,
  "suggestedReplies": ["2-3 short options in ${targetLangName} the user might say next, natural and contextual"],
  "scores": { "vocabulary": 0-30, "grammar": 0-25, "fluency": 0-20, "cultural": 0-15, "task": 0-10 },
  "feedback": "Constructive linguistic analysis coaching feedback targeted at the learner",
  "corrections": [
    {
      "correctionType": "grammar",
      "originalText": "example with error",
      "correctedText": "corrected version",
      "explanation": "Explanation of the correction in ${nativeLangName}",
      "severity": "minor"
    }
  ],
  "nextAiReply": {
    "target": "The next sentence spoken by ${scenario.aiCharacterName} in natural ${targetLangName}",
    "native": "${nativeLangName} translation of that AI response sentence",
    "romaji": ${hasRomaji ? '"Romaji transcription (only for Japanese)"' : 'null'},
    "emotionTone": "formal-polite",
    "gestureHint": "slight bow"
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

  const contents = [
    ...conversationHistory,
    { role: 'user' as const, parts: [{ text: userContent }] }
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: 'application/json'
    }
  });

  if (!response.text) {
    throw new Error('Received an empty response back from the Gemini API system.');
  }

  return JSON.parse(response.text) as AIResponseAnalysis;
}
