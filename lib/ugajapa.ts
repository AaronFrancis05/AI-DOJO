/* ─────────────────────────────────────────────────────────
   UgaJapa Translation API — https://uj-tc-api.akademia.co.jp
   Central translation API for Mattermost plugins with auth,
   quality scoring, usage metering, and usage-based billing.

   Verified against the live API (dashboard API quick start):
     POST /translate  { text, from?, to? }  -> { translated, from, to, detected_from, quality:{score,label,passed}, quality_score, ... }
     POST /detect     { text }             -> { language, confidence, text }

   Every exported helper fails OPEN: if UGAJAPA_API_KEY is
   missing or any call errors, callers get a null/fallback and
   the app falls back to showing the original text untranslated.
   Nothing blocks on UgaJapa being unavailable.
   ───────────────────────────────────────────────────────── */

const UGAJAPA_API_BASE = process.env.UGAJAPA_API_BASE_URL ?? 'https://uj-tc-api.akademia.co.jp';

const UGAJAPA_END_PATHS = {
  translate: '/translate',
  detect: '/detect',
  languages: '/languages',
} as const;

export function isUgaJapaConfigured(): boolean {
  return Boolean(process.env.UGAJAPA_API_KEY);
}

export interface UgaJapaTranslateResult {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  qualityScore: number | null;
  provider: string;
}

export interface UgaJapaDetectResult {
  language: string | null;
  confidence: number | null;
}

async function ugajapaFetch<T>(path: string, body: unknown): Promise<T> {
  const apiKey = process.env.UGAJAPA_API_KEY;
  if (!apiKey) throw new Error('UGAJAPA_API_KEY is not set');

  const res = await fetch(`${UGAJAPA_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
    // UgaJapa is a value-add: never let a slow upstream stall message sends.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`UgaJapa HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Translate a string of text into a target language. Fails open:
 * returns { translatedText: source, provider: 'none', qualityScore: null }
 * when UgaJapa is unconfigured/unreachable so callers never block the
 * happy path on translation problems.
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string | null,
): Promise<UgaJapaTranslateResult> {
  if (!isUgaJapaConfigured() || !text || !targetLanguage) {
    return {
      translatedText: text,
      sourceLanguage: sourceLanguage ?? null,
      targetLanguage,
      qualityScore: null,
      provider: 'none',
    };
  }

  try {
    const payload: Record<string, string> = { text, to: targetLanguage };
    if (sourceLanguage) payload.from = sourceLanguage;

    const data = await ugajapaFetch<Record<string, unknown>>(UGAJAPA_END_PATHS.translate, payload);

    const translated = (
      pick(data, 'translated', 'translatedText', 'translated_text', 'result')
    ) as unknown;

    const rawQuality =
      pick(data, 'quality_score', 'qualityScore')
      ?? (typeof (data as { quality?: unknown }).quality === 'object'
        && (data as { quality: Record<string, unknown> }).quality !== null
        ? ((data as { quality: Record<string, unknown> }).quality.score ?? null)
        : null);

    const numericQuality = rawQuality != null ? Number(rawQuality) : null;

    return {
      translatedText:
        typeof translated === 'string' && translated.length > 0 ? translated : text,
      sourceLanguage:
        (pick(data, 'detected_from', 'detectedSourceLanguage', 'source_language') as string | null)
        ?? sourceLanguage
        ?? null,
      targetLanguage,
      qualityScore: Number.isFinite(numericQuality) ? numericQuality! : null,
      provider: 'ugajapa',
    };
  } catch (err) {
    console.warn('[ugajapa] translate failed, falling back to original text:', err instanceof Error ? err.message : String(err));
    return {
      translatedText: text,
      sourceLanguage: sourceLanguage ?? null,
      targetLanguage,
      qualityScore: null,
      provider: 'none',
    };
  }
}

/** Translation that must never throw — returns the source text on any failure. */
export async function translateTextSafe(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string | null,
): Promise<UgaJapaTranslateResult> {
  try {
    return await translateText(text, targetLanguage, sourceLanguage);
  } catch (err) {
    console.warn('[ugajapa] translateTextSafe caught:', err instanceof Error ? err.message : String(err));
    return {
      translatedText: text,
      sourceLanguage: sourceLanguage ?? null,
      targetLanguage,
      qualityScore: null,
      provider: 'none',
    };
  }
}

/**
 * Try to detect the language of `text`. Safely open: returns null
 * when unconfigured or on failure (caller stores `sourceLanguage: null`,
 * which simply means translation proceeds without a `from` hint).
 */
export async function detectLanguage(text: string): Promise<UgaJapaDetectResult | null> {
  if (!isUgaJapaConfigured() || !text) return null;
  try {
    const data = await ugajapaFetch<Record<string, unknown>>(UGAJAPA_END_PATHS.detect, { text });
    const language = (data.language ?? data.detected_language ?? data.detectedSourceLanguage ?? null) as string | null;
    const confidence = data.confidence != null ? Number(data.confidence) : null;
    if (!language) return null;
    return {
      language: String(language),
      confidence: Number.isFinite(confidence) ? confidence : null,
    };
  } catch (err) {
    console.warn('[ugajapa] detect failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function detectLanguageSafe(text: string): Promise<UgaJapaDetectResult | null> {
  try {
    return await detectLanguage(text);
  } catch {
    return null;
  }
}

/** Pick the first defined value from a set of candidate keys (defensive). */
function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
}