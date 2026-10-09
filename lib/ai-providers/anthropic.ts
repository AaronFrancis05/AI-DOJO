import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ChatTurn, GenerateOptions } from './types';
import { AIProviderError, categorizeProviderError, modelForTier } from './types';

// Anthropic rejects an empty `messages` array, so when no history is supplied
// we still need a valid user turn. The system instruction carries the actual
// task; this placeholder is just a legal message. Callers that pass `[]` are
// real: the session recap and the per-phase hand-off lines are both
// prompt-only generations.
const EMPTY_HISTORY_PLACEHOLDER = 'Generate the requested output described in the system instruction.';

function toMessages(history: ChatTurn[]): { role: 'user' | 'assistant'; content: string }[] {
  if (history.length === 0) {
    return [{ role: 'user', content: EMPTY_HISTORY_PLACEHOLDER }];
  }
  return history.map(t => ({
    role: t.role as 'user' | 'assistant',
    content: t.content,
  }));
}

export function createAnthropicProvider(): AIProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIProviderError('anthropic', 'ANTHROPIC_API_KEY is missing from environment variables');
  }

  const modelName = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const batchModelName = process.env.ANTHROPIC_BATCH_MODEL;
  const client = new Anthropic({ apiKey });

  return {
    name: 'anthropic',

    async generateJSON(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): Promise<string> {
      const model = modelForTier(options?.modelTier, modelName, batchModelName);
      try {
        const systemWithJson = `${systemInstruction}\n\nCRITICAL: Respond with raw JSON only. No markdown fences, no code blocks, no surrounding text — just the JSON object.`;

        const messages = toMessages(history);

        const response = await client.messages.create({
          model,
          system: systemWithJson,
          messages,
          max_tokens: options?.maxTokens ?? 4096,
        });

        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );

        if (!textBlock) {
          throw new AIProviderError('anthropic', 'Received empty response from Anthropic API');
        }

        options?.onUsage?.({
          provider: 'anthropic',
          model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });

        let text = textBlock.text;

        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          text = fenceMatch[1].trim();
        }

        return text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('anthropic', model, err);
      }
    },

    async *generateStream(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): AsyncIterable<string> {
      const model = modelForTier(options?.modelTier, modelName, batchModelName);
      try {
        const messages = toMessages(history);

        const stream = await client.messages.create({
          model,
          system: systemInstruction,
          messages,
          max_tokens: options?.maxTokens ?? 4096,
          stream: true,
        }) as unknown as AsyncIterable<Anthropic.MessageStreamEvent>;

        // Input tokens arrive on message_start, the output total on message_delta.
        let inputTokens = 0;
        let outputTokens = 0;
        for await (const chunk of stream) {
          if (chunk.type === 'message_start') {
            inputTokens = chunk.message.usage.input_tokens;
          } else if (chunk.type === 'message_delta') {
            outputTokens = chunk.usage.output_tokens;
          } else if (chunk.type === 'content_block_delta' && chunk.delta && 'text' in chunk.delta) {
            yield (chunk.delta as { text: string }).text;
          }
        }
        options?.onUsage?.({ provider: 'anthropic', model, inputTokens, outputTokens });
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('anthropic', model, err);
      }
    },
  };
}
