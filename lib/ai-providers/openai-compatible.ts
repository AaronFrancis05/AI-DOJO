import OpenAI from 'openai';
import type { AIProvider, ChatTurn } from './types';
import { AIProviderError, categorizeProviderError } from './types';

export function createOpenAICompatibleProvider(): AIProvider {
  const baseURL = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  const apiKey = process.env.AI_API_KEY;
  const modelName = process.env.AI_MODEL;
  const jsonMode = process.env.AI_JSON_MODE !== 'off';

  if (!modelName) {
    throw new AIProviderError('openai-compatible', 'AI_MODEL is required');
  }

  const client = new OpenAI({
    baseURL,
    apiKey: apiKey ?? undefined,
  });

  return {
    name: 'openai-compatible',

    async generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string> {
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemInstruction },
          ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        ];

        const response = await client.chat.completions.create({
          model: modelName,
          messages,
          ...(jsonMode ? { response_format: { type: 'json_object' } as const } : {}),
        });

        const text = response.choices?.[0]?.message?.content;
        if (!text) {
          throw new AIProviderError('openai-compatible', `Received empty response from ${baseURL}`);
        }

        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('openai-compatible', modelName, err);
      }
    },
  };
}
