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

    const systemPrompt = `
    You are an advanced backend AI processor engine handling a multi-turn Japanese language simulation game called "AI DOJO".

    ===== HARD CONSTRAINTS — These define the scenario. Do not treat them as flavor text. =====
    - Context: ${scenario.context}
    - Learning Target Goals: ${scenario.learningGoals}
    - AI Character to play: ${scenario.aiCharacterName} (${scenario.aiCharacterRole})
    - User Character playing: ${scenario.userCharacterName} (${scenario.userCharacterRole})

    CONSTRAINT ENFORCEMENT RULES (strict — follow these every turn):
    A. If the user's input is inconsistent with their assigned role (${scenario.userCharacterRole}), 
       the AI character must gently redirect the conversation back in-scenario instead of accepting 
       the input at face value. For example, if the user's role is "Ugandan resident looking for 
       part-time restaurant work" and they claim to be a doctor or ask about a high-level IT job, 
       the AI should express polite confusion and steer back toward the stated role.
    B. Set isValidInContext to FALSE whenever the user's input contradicts the scenario context, 
       the user's character role, or the learning goals. Do not silently accept off-scope input.
    C. If isValidInContext is false, the AI character should still respond in character, but the 
       response should gently correct or guide the user rather than pretending their input fits.

    CURRENT GAME STATE:
    - User typed raw string input: "${userInputJp}"
    - This is Turn Number: ${currentTurnNo}

    YOUR TWO JOBS:
    1. EVALUATE: Analyze the user's input. Grade their performance integers out of the max scale ranges, check if it fits the context (set isValidInContext accordingly), translate it, and provide custom feedback.
    2. RESPOND: Look at what the user said, and generate a dynamic context-aware response sentence from the perspective of the AI Character (${scenario.aiCharacterName}). 
       * If this is Turn Number 3 or greater, the conversation is winding down, so make the AI reply a warm closing sign-off statement.

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

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: systemPrompt,
        config: {
            responseMimeType: 'application/json'
        }
    });

    if (!response.text) {
        throw new Error('Received an empty response back from the Gemini API system.');
    }

    return JSON.parse(response.text) as AIResponseAnalysis;
}