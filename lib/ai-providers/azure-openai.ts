import { AzureOpenAI } from 'openai';
import type { AIProvider, ChatTurn } from './types';
import { AIProviderError, categorizeProviderError } from './types';

export function createAzureOpenAIProvider(): AIProvider {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint) throw new AIProviderError('azure-openai', 'AZURE_OPENAI_ENDPOINT is missing');
  if (!apiKey) throw new AIProviderError('azure-openai', 'AZURE_OPENAI_KEY is missing');
  if (!deployment) throw new AIProviderError('azure-openai', 'AZURE_OPENAI_DEPLOYMENT is missing');

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21';

  const client = new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion,
    deployment,
  });

  return {
    name: 'azure-openai',

    async generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string> {
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemInstruction },
          ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        ];

        const response = await client.chat.completions.create({
          model: deployment,
          messages,
          response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content;
        if (!text) {
          throw new AIProviderError('azure-openai', 'Received empty response from Azure OpenAI');
        }

        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('azure-openai', deployment, err);
      }
    },
  };
}
