import OpenAI from 'openai';
import type { AIProvider, ChatTurn, GenerateOptions } from './types';
import { AIProviderError, categorizeProviderError, modelForTier, openAIUsage } from './types';

export function createOpenAICompatibleProvider(): AIProvider {
  const baseURL = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  const apiKey = process.env.AI_API_KEY;
  const modelName = process.env.AI_MODEL;
  const batchModelName = process.env.AI_BATCH_MODEL;
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
          ...(jsonMode ? { response_format: { type: 'json_object' } as const } : {}),
        });

        const text = response.choices?.[0]?.message?.content;
        if (!text) {
          throw new AIProviderError('openai-compatible', `Received empty response from ${baseURL}`);
        }

        const usage = openAIUsage('openai-compatible', model, response.usage);
        if (usage) options?.onUsage?.(usage);
        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('openai-compatible', model, err);
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
        const usage = openAIUsage('openai-compatible', model, rawUsage);
        if (usage) options?.onUsage?.(usage);
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('openai-compatible', model, err);
      }
    },
  };
}
