import OpenAI from 'openai';
import type { AIProvider, ChatTurn } from './types';
import { AIProviderError, categorizeProviderError } from './types';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export function createGroqProvider(): AIProvider {
  const apiKey = process.env.GROQ_API_KEY;
  const modelName = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

  if (!apiKey) {
    throw new AIProviderError('groq', 'GROQ_API_KEY is required');
  }

  const client = new OpenAI({
    baseURL: GROQ_BASE_URL,
    apiKey,
  });

  return {
    name: 'groq',

    async generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string> {
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemInstruction },
          ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        ];

        const response = await client.chat.completions.create({
          model: modelName,
          messages,
          response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content;
        if (!text) {
          throw new AIProviderError('groq', 'Received empty response from Groq');
        }

        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('groq', modelName, err);
      }
    },
  };
}
