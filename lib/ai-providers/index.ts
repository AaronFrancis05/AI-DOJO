import type { AIProvider } from './types';

export type { AIProvider, ChatTurn } from './types';
export { AIProviderError, AIQuotaError, AIModelError } from './types';

let cachedProvider: AIProvider | null = null;
let cachedProviderKey: string | null = null;

export async function getAIProvider(): Promise<AIProvider> {
  const selected = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase();
  if (cachedProvider && cachedProviderKey === selected) return cachedProvider;

  switch (selected) {
    case 'gemini': {
      const mod = await import('./gemini');
      cachedProvider = mod.createGeminiProvider();
      break;
    }
    case 'azure-openai': {
      const mod = await import('./azure-openai');
      cachedProvider = mod.createAzureOpenAIProvider();
      break;
    }
    case 'openai-compatible': {
      const mod = await import('./openai-compatible');
      cachedProvider = mod.createOpenAICompatibleProvider();
      break;
    }
    case 'anthropic': {
      const mod = await import('./anthropic');
      cachedProvider = mod.createAnthropicProvider();
      break;
    }
    case 'groq': {
      const mod = await import('./groq');
      cachedProvider = mod.createGroqProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${selected}". Expected one of: gemini, azure-openai, openai-compatible, anthropic, groq.`
      );
  }

  cachedProviderKey = selected;
  return cachedProvider;
}
