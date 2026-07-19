import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ChatTurn } from './types';
import { AIProviderError, categorizeProviderError } from './types';

export function createAnthropicProvider(): AIProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIProviderError('anthropic', 'ANTHROPIC_API_KEY is missing from environment variables');
  }

  const modelName = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey });

  return {
    name: 'anthropic',

    async generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string> {
      try {
        const systemWithJson = `${systemInstruction}\n\nCRITICAL: Respond with raw JSON only. No markdown fences, no code blocks, no surrounding text — just the JSON object.`;

        const messages = history.map(t => ({
          role: t.role as 'user' | 'assistant',
          content: t.content,
        }));

        const response = await client.messages.create({
          model: modelName,
          system: systemWithJson,
          messages,
          max_tokens: 4096,
        });

        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );

        if (!textBlock) {
          throw new AIProviderError('anthropic', 'Received empty response from Anthropic API');
        }

        let text = textBlock.text;

        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          text = fenceMatch[1].trim();
        }

        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('anthropic', modelName, err);
      }
    },
  };
}
