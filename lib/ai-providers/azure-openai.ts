import { AzureOpenAI } from 'openai';
import type { AIProvider, ChatTurn, GenerateOptions } from './types';
import { AIProviderError, categorizeProviderError, modelForTier, openAIUsage } from './types';

export function createAzureOpenAIProvider(): AIProvider {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint) throw new AIProviderError('azure-openai', 'AZURE_OPENAI_ENDPOINT is missing');
  if (!apiKey) throw new AIProviderError('azure-openai', 'AZURE_OPENAI_KEY is missing');
  if (!deployment) throw new AIProviderError('azure-openai', 'AZURE_OPENAI_DEPLOYMENT is missing');

  const batchDeployment = process.env.AZURE_OPENAI_BATCH_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21';

  // The SDK bakes `deployment` into the base URL and ignores the request's
  // `model`, so the batch deployment needs a client of its own.
  const clients = new Map<string, AzureOpenAI>();
  const clientFor = (name: string): AzureOpenAI => {
    let c = clients.get(name);
    if (!c) {
      c = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment: name });
      clients.set(name, c);
    }
    return c;
  };

  return {
    name: 'azure-openai',

    async generateJSON(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): Promise<string> {
      const model = modelForTier(options?.modelTier, deployment, batchDeployment);
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemInstruction },
          ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        ];

        const response = await clientFor(model).chat.completions.create({
          model,
          messages,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content;
        if (!text) {
          throw new AIProviderError('azure-openai', 'Received empty response from Azure OpenAI');
        }

        const usage = openAIUsage('azure-openai', model, response.usage);
        if (usage) options?.onUsage?.(usage);
        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('azure-openai', model, err);
      }
    },

    async *generateStream(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): AsyncIterable<string> {
      const model = modelForTier(options?.modelTier, deployment, batchDeployment);
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemInstruction },
          ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        ];

        const stream = await clientFor(model).chat.completions.create({
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
        const usage = openAIUsage('azure-openai', model, rawUsage);
        if (usage) options?.onUsage?.(usage);
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('azure-openai', model, err);
      }
    },
  };
}
