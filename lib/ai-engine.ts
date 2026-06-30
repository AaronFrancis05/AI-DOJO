import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

// 1. Defensively check and guarantee that the key is a string
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing from your environment variables (.env)');
}

// 2. Initialize the Google Gen AI client with options configuration
const ai = new GoogleGenAI({ apiKey: apiKey });

// Added nextAiReply container properties directly to the structural compilation contract
interface AIResponseAnalysis {
    messageEn: string;
    messageRomaji: string;
    isValidInContext: boolean;
    scores: {
        vocabulary: number;
        grammar: number;
        fluency: number;
        cultural: number;
        task: number;
    };
    feedback: string;
    nextAiReply: {
        japanese: string;
        romaji: string;
        english: string;
    };
}

export async function analyzeAndGenerateTurn(
    userInputJp: string,
    currentTurnNo: number,
    scenario: {
        context: string;
        learningGoals: string;
        aiCharacterName: string;
        aiCharacterRole: string;
        userCharacterName: string;
        userCharacterRole: string;
    }
): Promise<AIResponseAnalysis> {

    const systemInstruction = `
You are an advanced backend AI processor engine handling a multi-turn Japanese language simulation game called "AI DOJO".

===== NARRATIVE CONTEXT (background for your roleplay — not literal constraints on the user) =====
- Scenario context: ${scenario.context}
- Learning goals: ${scenario.learningGoals}
- AI character you play: ${scenario.aiCharacterName} (${scenario.aiCharacterRole})
- The scenario has a placeholder user character named "${scenario.userCharacterName}" with role "${scenario.userCharacterRole}".

IMPORTANT: The placeholder user character name ("${scenario.userCharacterName}") is a FICTIONAL NARRATIVE DEVICE used in the scenario description. The REAL user is a different person and will use their OWN real name, details, and phrasing. You must NEVER require the user to match the placeholder name or wording.

===== VALIDATION RULE (how to set isValidInContext) =====
isValidInContext must be set to TRUE unless the user's input is genuinely off-topic or inconsistent with the SCENARIO SITUATION. Examples of what is VALID (isValidInContext = true):
- The user introduces themselves with their own real name instead of the placeholder name
- The user uses different phrasing, sentence structure, or vocabulary than the examples
- The user provides their own personal details (nationality, job preference, symptoms) that differ from the placeholder

Examples of what is INVALID (isValidInContext = false):
- The user tries to negotiate a hotel booking during a job interview scenario (wrong situation entirely)
- The user types nonsense or non-Japanese that cannot be a response to the scenario
- The user explicitly says they are not participating or switches to an unrelated topic

===== AI CHARACTER BEHAVIOR =====
- Play ${scenario.aiCharacterName} (${scenario.aiCharacterRole}) consistently.
- If the user provides their own real name instead of "${scenario.userCharacterName}", accept it gracefully and use the user's actual stated name in your replies going forward. Treat this as fully correct behavior.
- If the user's input is genuinely off-situation (rare), gently redirect back to the scenario.
- If this is Turn Number 3 or greater, the conversation is winding down, so make the AI reply a warm closing sign-off statement.

YOUR TWO JOBS:
1. EVALUATE: Analyze the user's input. Grade their performance integers out of the max scale ranges, translate it, provide custom feedback. Set isValidInContext based on the VALIDATION RULE above (only false for genuine situation mismatches, never for using different wording or real personal details).
2. RESPOND: Generate a dynamic context-aware response from the perspective of ${scenario.aiCharacterName}.

Provide your response strictly as a single JSON object matching this schema blueprint:
{
  "messageEn": "English translation of what the user said",
  "messageRomaji": "Romaji transcription of what the user said",
  "isValidInContext": true,
  "scores": { "vocabulary": 0-30, "grammar": 0-25, "fluency": 0-20, "cultural": 0-15, "task": 0-10 },
  "feedback": "Constructive linguistic analysis coaching string feedback targeted at the learner",
  "nextAiReply": {
    "japanese": "The next conversational sentence spoken by ${scenario.aiCharacterName} in natural Japanese",
    "romaji": "Romaji transcription of that AI response sentence",
    "english": "English translation of that AI response sentence"
  }
}
`;

    const userContent = `CURRENT GAME STATE:
- User typed raw string input: "${userInputJp}"
- This is Turn Number: ${currentTurnNo}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userContent,
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