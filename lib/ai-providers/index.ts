import type { AIProvider, ChatTurn } from './types';
import { AIProviderError } from './types';

export type { AIProvider, ChatTurn } from './types';
export { AIProviderError, AIQuotaError, AIModelError } from './types';

type ProviderFactory = () => Promise<AIProvider>;

const providerFactories: Record<string, ProviderFactory> = {
  gemini: async () => (await import('./gemini')).createGeminiProvider(),
  'azure-openai': async () => (await import('./azure-openai')).createAzureOpenAIProvider(),
  'openai-compatible': async () => (await import('./openai-compatible')).createOpenAICompatibleProvider(),
  anthropic: async () => (await import('./anthropic')).createAnthropicProvider(),
  groq: async () => (await import('./groq')).createGroqProvider(),
};

const VALID_PROVIDERS = Object.keys(providerFactories);

// ── Circuit breaker state ──────────────────────────────────
// After FAILURE_THRESHOLD consecutive failures, a provider's circuit
// opens and it is skipped for COOLDOWN_MS before being retried. A single
// success resets the failure count so a healthy provider isn't starved.
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

const circuitState: Record<string, { failures: number; openedAt: number }> = {};

function isCircuitOpen(name: string): boolean {
  const state = circuitState[name];
  if (!state || state.failures < FAILURE_THRESHOLD) return false;
  if (Date.now() - state.openedAt > COOLDOWN_MS) {
    delete circuitState[name];
    return false;
  }
  return true;
}

function recordFailure(name: string) {
  const state = (circuitState[name] ??= { failures: 0, openedAt: 0 });
  state.failures += 1;
  if (state.failures >= FAILURE_THRESHOLD) state.openedAt = Date.now();
}

function recordSuccess(name: string) {
  delete circuitState[name];
}

// ── Provider ordering ──────────────────────────────────────
// Primary from AI_PROVIDER, then any fallbacks from AI_FALLBACK_PROVIDERS
// (comma-separated). Providers without a configured API key are skipped
// at construction time (their factory throws).
function resolveProviderOrder(): string[] {
  const primary = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase();
  const fallbacks = (process.env.AI_FALLBACK_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const order: string[] = [];
  for (const name of [primary, ...fallbacks]) {
    if (VALID_PROVIDERS.includes(name) && !order.includes(name)) order.push(name);
  }
  return order.length > 0 ? order : [primary];
}

const providerCache = new Map<string, AIProvider>();

async function getHealthyProvider(name: string): Promise<AIProvider | null> {
  if (isCircuitOpen(name)) return null;

  const cached = providerCache.get(name);
  if (cached) return cached;

  const factory = providerFactories[name];
  if (!factory) return null;

  try {
    const provider = await factory();
    providerCache.set(name, provider);
    return provider;
  } catch (err) {
    // Unconfigured provider — skip it for this request.
    console.warn(`[ai-provider] "${name}" unavailable:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Returns the AI provider for this request, with automatic failover.
 *
 * The primary provider (AI_PROVIDER) is tried first. On a provider-level
 * failure it falls back through AI_FALLBACK_PROVIDERS in order. Each
 * provider is guarded by a circuit breaker so a repeatedly failing
 * provider is skipped for a cooldown window instead of being hammered.
 */
export async function getAIProvider(): Promise<AIProvider> {
  const order = resolveProviderOrder();
  const primaryName = order[0];

  const provider: AIProvider = {
    name: primaryName,

    async generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string> {
      let lastError: unknown = null;

      for (const name of order) {
        const candidate = await getHealthyProvider(name);
        if (!candidate) continue;

        try {
          const result = await candidate.generateJSON(systemInstruction, history);
          recordSuccess(name);
          return result;
        } catch (err) {
          lastError = err;
          recordFailure(name);
          console.warn(`[ai-provider] "${name}" generateJSON failed, ${order.filter((n) => n !== name).length > 0 ? 'trying fallback' : 'no fallback left'}:`, err instanceof Error ? err.message : String(err));
        }
      }

      if (lastError instanceof AIProviderError) throw lastError;
      throw new AIProviderError(primaryName, 'All AI providers failed', lastError);
    },

    async *generateStream(systemInstruction: string, history: ChatTurn[]): AsyncIterable<string> {
      let lastError: unknown = null;

      for (const name of order) {
        const candidate = await getHealthyProvider(name);
        if (!candidate) continue;

        let yielded = false;
        try {
          for await (const chunk of candidate.generateStream(systemInstruction, history)) {
            yielded = true;
            yield chunk;
          }
          recordSuccess(name);
          return;
        } catch (err) {
          lastError = err;
          recordFailure(name);
          // Only fall back if nothing was streamed yet — a mid-stream
          // failure can't be replayed without corrupting the transcript.
          if (yielded) throw err;
          console.warn(`[ai-provider] "${name}" generateStream failed before output, ${order.filter((n) => n !== name).length > 0 ? 'trying fallback' : 'no fallback left'}:`, err instanceof Error ? err.message : String(err));
        }
      }

      if (lastError instanceof AIProviderError) throw lastError;
      throw new AIProviderError(primaryName, 'All AI providers failed', lastError);
    },
  };

  return provider;
}
