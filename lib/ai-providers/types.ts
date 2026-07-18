export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  readonly name: string;
  generateJSON(systemInstruction: string, history: ChatTurn[]): Promise<string>;
}

export class AIProviderError extends Error {
  constructor(
    providerName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[AI provider: ${providerName}] ${message}`);
    this.name = 'AIProviderError';
  }

  get verboseLog(): string {
    return this.cause
      ? `${this.message}\nCaused by: ${serializeError(this.cause)}`
      : this.message;
  }
}

/** Quota or rate-limit exceeded. */
export class AIQuotaError extends AIProviderError {
  constructor(
    providerName: string,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly quotaMetrics?: string[],
    cause?: unknown,
  ) {
    super(providerName, message, cause);
    this.name = 'AIQuotaError';
  }
}

/** Model not found, deprecated, or auth failure. */
export class AIModelError extends AIProviderError {
  constructor(providerName: string, message: string, cause?: unknown) {
    super(providerName, message, cause);
    this.name = 'AIModelError';
  }
}

// ── Helpers ────────────────────────────────────────────────

function serializeError(err: unknown): string {
  if (!err) return String(err);
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (e.name) parts.push(`name=${e.name}`);
    if (e.message) parts.push(`message=${e.message}`);
    if (e.status !== undefined) parts.push(`status=${e.status}`);
    if (e.code !== undefined) parts.push(`code=${e.code}`);
    const rest = { ...e };
    delete rest.name; delete rest.message; delete rest.status; delete rest.code;
    if (Object.keys(rest).length) parts.push(`details=${JSON.stringify(rest)}`);
    return parts.join(' | ');
  }
  return String(err);
}

function extractStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.status === 'number') return e.status;
    if (typeof e.code === 'number') return e.code;
    if (e.error && typeof e.error === 'object') {
      const errBody = e.error as Record<string, unknown>;
      if (typeof errBody.code === 'number') return errBody.code;
    }
  }
  return undefined;
}

function extractErrorBody(err: unknown): Record<string, unknown> | null {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e.error && typeof e.error === 'object') return e.error as Record<string, unknown>;
    return e;
  }
  return null;
}

export function categorizeProviderError(
  providerName: string,
  modelName: string,
  rawError: unknown,
): AIProviderError {
  const status = extractStatus(rawError);
  const body = extractErrorBody(rawError);
  const message = typeof body?.message === 'string' ? body.message : String(rawError);
  const bodyStr = body ? JSON.stringify(body, null, 2) : '';

  const taggedMsg = `[model=${modelName}] ${message}`;

  // Quota / rate-limit (429)
  if (status === 429 || message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('resource_exhausted') || message.toLowerCase().includes('too many requests')) {
    const retryMatch = message.match(/retry in (\d+(?:\.\d+)?)s/);
    const retryAfter = retryMatch ? parseFloat(retryMatch[1]) : undefined;
    const metrics: string[] = [];
    if (body?.details && Array.isArray(body.details)) {
      for (const d of body.details) {
        if (d.quotaFailure?.violations) {
          for (const v of d.quotaFailure.violations) {
            if (v.quotaMetric) metrics.push(v.quotaMetric);
          }
        }
      }
    }
    return new AIQuotaError(providerName, `${taggedMsg}\n${bodyStr}`.trim(), retryAfter, metrics.length ? metrics : undefined, rawError);
  }

  // Model not found / auth (401, 403, 404)
  if (status === 401 || status === 403 || status === 404 || message.toLowerCase().includes('not found') || message.toLowerCase().includes('not supported') || message.toLowerCase().includes('api key')) {
    return new AIModelError(providerName, `${taggedMsg}\n${bodyStr}`.trim(), rawError);
  }

  // Generic provider error
  return new AIProviderError(providerName, `${taggedMsg}\n${bodyStr}`.trim(), rawError);
}
