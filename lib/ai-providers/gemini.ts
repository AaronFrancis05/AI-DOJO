import { GoogleGenAI } from '@google/genai';
import type { AIProvider, ChatTurn } from './types';
import { AIProviderError, categorizeProviderError } from './types';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export function createGeminiProvider(): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIProviderError('gemini', 'GEMINI_API_KEY is missing from environment variables');
  }

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  const ai = new GoogleGenAI({ apiKey });

  // Roleplay replies are specified as 1-3 sentences. Capping output keeps a
  // model that ignores that from stalling the turn, and bounds the worst case
  // for the streaming speech queue downstream.
  const REPLY_MAX_OUTPUT_TOKENS = 400;

  // Spoken conversation is latency-critical: a thinking pass before the first
  // token is dead air the learner hears. Disabled explicitly rather than
  // relying on the current default for whichever 2.5-series model is
  // configured. Analysis (generateJSON) is off the critical path and is left
  // alone so it can reason about scoring.
  // Only the 2.5 Flash family accepts a zero budget. Gemini 2.5 Pro cannot
  // have thinking turned off and rejects the request outright, so a `2.5`
  // substring test would have taken the whole provider down for a Pro model.
  const canDisableThinking = /2\.5-flash/.test(modelName);
  const thinkingConfig = canDisableThinking ? { thinkingBudget: 0 } : undefined;

  return {
    name: 'gemini',

    async generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string> {
      try {
        // Gemini rejects an empty `contents` array ("contents are required"),
        // so when no history is supplied we still need a valid user turn. The
        // systemInstruction carries the actual task; this placeholder is just
        // a legal first message for the API.
        const contents: GeminiMessage[] = history.length > 0
          ? history.map(t => ({
              role: t.role === 'assistant' ? 'model' as const : 'user' as const,
              parts: [{ text: t.content }],
            }))
          : [{ role: 'user' as const, parts: [{ text: 'Generate the requested output described in the system instruction.' }] }];

        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        if (!response.text) {
          throw new AIProviderError('gemini', 'Received empty response from Gemini API');
        }

        return response.text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('gemini', modelName, err);
      }
    },

    async *generateStream(systemInstruction: string, history: ChatTurn[]): AsyncIterable<string> {
      try {
        const contents: GeminiMessage[] = history.map(t => ({
          role: t.role === 'assistant' ? 'model' as const : 'user' as const,
          parts: [{ text: t.content }],
        }));

        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            maxOutputTokens: REPLY_MAX_OUTPUT_TOKENS,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        });

        for await (const chunk of stream) {
          if (chunk.text) yield chunk.text;
        }
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('gemini', modelName, err);
      }
    },
  };
}
