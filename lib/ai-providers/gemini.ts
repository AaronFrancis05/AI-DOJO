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

  return {
    name: 'gemini',

    async generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string> {
      try {
        const contents: GeminiMessage[] = history.map(t => ({
          role: t.role === 'assistant' ? 'model' as const : 'user' as const,
          parts: [{ text: t.content }],
        }));

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
          config: { systemInstruction },
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
