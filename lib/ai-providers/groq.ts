import OpenAI from 'openai';
import type { AIProvider, ChatTurn, GenerateOptions } from './types';
import { AIProviderError, categorizeProviderError, modelForTier, openAIUsage } from './types';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export function createGroqProvider(): AIProvider {
  const apiKey = process.env.GROQ_API_KEY;
  const modelName = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  const batchModelName = process.env.GROQ_BATCH_MODEL;

  if (!apiKey) {
    throw new AIProviderError('groq', 'GROQ_API_KEY is required');
  }

  const client = new OpenAI({
    baseURL: GROQ_BASE_URL,
    apiKey,
  });

  return {
    name: 'groq',

    async generateJSON(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): Promise<string> {
      const model = modelForTier(options?.modelTier, modelName, batchModelName);
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemInstruction },
          ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        ];

        const response = await client.chat.completions.create({
          model,
          messages,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content;
        if (!text) {
          throw new AIProviderError('groq', 'Received empty response from Groq');
        }

        const usage = openAIUsage('groq', model, response.usage);
        if (usage) options?.onUsage?.(usage);
        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('groq', model, err);
      }
    },

    async *generateStream(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): AsyncIterable<string> {
      const model = modelForTier(options?.modelTier, modelName, batchModelName);
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemInstruction },
          ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        ];

        const stream = await client.chat.completions.create({
          model,
          messages,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          stream: true,
        });

        // Usage arrives on a final chunk only when the endpoint sends one
        // (Groq always does, under x_groq; OpenAI only with include_usage,
        // which is not requested so an endpoint that rejects it keeps working).
        let rawUsage: unknown;
        for await (const chunk of stream) {
          const withUsage = chunk as { usage?: unknown; x_groq?: { usage?: unknown } };
          rawUsage = withUsage.usage ?? withUsage.x_groq?.usage ?? rawUsage;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
        const usage = openAIUsage('groq', model, rawUsage);
        if (usage) options?.onUsage?.(usage);
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('groq', model, err);
      }
    },
  };
}
