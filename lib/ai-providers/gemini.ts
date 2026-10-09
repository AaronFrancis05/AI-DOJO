import { GoogleGenAI } from '@google/genai';
import type { AIProvider, ChatTurn, GenerateOptions } from './types';
import { AIProviderError, categorizeProviderError, modelForTier } from './types';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Gemini rejects an empty `contents` array ("contents are required"), so when
// no history is supplied we still need a valid user turn. The
// systemInstruction carries the actual task; this placeholder is just a legal
// first message for the API. Callers that pass `[]` are real: the session
// recap and the per-phase hand-off lines are both prompt-only generations.
const EMPTY_HISTORY_PLACEHOLDER = 'Generate the requested output described in the system instruction.';

function toContents(history: ChatTurn[]): GeminiMessage[] {
  if (history.length === 0) {
    return [{ role: 'user', parts: [{ text: EMPTY_HISTORY_PLACEHOLDER }] }];
  }
  return history.map(t => ({
    role: t.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: t.content }],
  }));
}

export function createGeminiProvider(): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIProviderError('gemini', 'GEMINI_API_KEY is missing from environment variables');
  }

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  const batchModelName = process.env.GEMINI_BATCH_MODEL;
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
  const thinkingConfigFor = (model: string) =>
    /2\.5-flash/.test(model) ? { thinkingBudget: 0 } : undefined;

  type UsageMetadata = { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
  const reportUsage = (options: GenerateOptions | undefined, model: string, usage: UsageMetadata) => {
    if (!options?.onUsage || !usage) return;
    options.onUsage({
      provider: 'gemini',
      model,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
    });
  };

  return {
    name: 'gemini',

    async generateJSON(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): Promise<string> {
      const model = modelForTier(options?.modelTier, modelName, batchModelName);
      try {
        const contents = toContents(history);

        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
          },
        });

        if (!response.text) {
          throw new AIProviderError('gemini', 'Received empty response from Gemini API');
        }

        reportUsage(options, model, response.usageMetadata);
        return response.text;
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('gemini', model, err);
      }
    },

    async *generateStream(systemInstruction: string, history: ChatTurn[], options?: GenerateOptions): AsyncIterable<string> {
      const model = modelForTier(options?.modelTier, modelName, batchModelName);
      const thinkingConfig = thinkingConfigFor(model);
      try {
        const contents = toContents(history);

        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction,
            maxOutputTokens: options?.maxTokens ?? REPLY_MAX_OUTPUT_TOKENS,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        });

        // Every chunk carries the running totals; the last one is the call's.
        let usage: UsageMetadata;
        for await (const chunk of stream) {
          if (chunk.usageMetadata) usage = chunk.usageMetadata;
          if (chunk.text) yield chunk.text;
        }
        reportUsage(options, model, usage);
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw categorizeProviderError('gemini', model, err);
      }
    },
  };
}
