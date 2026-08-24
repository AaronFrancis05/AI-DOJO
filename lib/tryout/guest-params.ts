const STORAGE_KEY = 'ai-dojo:tryout-params';

export interface TryoutParams {
  targetLanguage: string;
  nativeLanguage: string;
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
    if (typeof parsed?.targetLanguage === 'string' && typeof parsed?.nativeLanguage === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
