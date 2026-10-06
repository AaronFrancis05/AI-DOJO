const STORAGE_KEY = 'ai-dojo:tryout-params';
const LANG_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)?$/i;

export interface TryoutParams {
  targetLanguage: string;
  nativeLanguage: string;
}

/** Drops anything that is not a language tag so it cannot ride a redirect. */
export function sanitizeLanguageCode(code: unknown): string | null {
  if (typeof code !== 'string' || !LANG_CODE.test(code)) return null;
  return code;
}

/** `?targetLanguage=&nativeLanguage=` for signup and the wizard entry URL. */
export function languagePairQuery(params: {
  targetLanguage?: string | null;
  nativeLanguage?: string | null;
}): string {
  const qs = new URLSearchParams();
  const target = sanitizeLanguageCode(params.targetLanguage);
  const native = sanitizeLanguageCode(params.nativeLanguage);
  if (target) qs.set('targetLanguage', target);
  if (native) qs.set('nativeLanguage', native);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function saveTryoutParams(params: TryoutParams): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // sessionStorage unavailable — non-critical
  }
}

export function loadTryoutParams(): TryoutParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const targetLanguage = sanitizeLanguageCode(parsed?.targetLanguage);
    const nativeLanguage = sanitizeLanguageCode(parsed?.nativeLanguage);
    if (targetLanguage && nativeLanguage) {
      return { targetLanguage, nativeLanguage };
    }
    return null;
  } catch {
    return null;
  }
}
