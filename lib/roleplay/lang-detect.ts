export function containsJapaneseScript(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(text);
}

export function containsChineseScript(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

export function containsKoreanScript(text: string): boolean {
  return /[\uac00-\ud7af]/.test(text);
}

export function containsTargetScript(text: string, targetBcp47: string): boolean {
  if (targetBcp47.startsWith('ja')) return containsJapaneseScript(text);
  if (targetBcp47.startsWith('zh')) return containsChineseScript(text);
  if (targetBcp47.startsWith('ko')) return containsKoreanScript(text);
  return false;
}

const SPAN_DELIMITER = /⟦([^⟧]*)⟧/g;

export interface LangSpan {
  text: string;
  lang: 'target' | 'native';
}

export function splitIntoLangSpans(raw: string): LangSpan[] {
  const spans: LangSpan[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  SPAN_DELIMITER.lastIndex = 0;

  while ((match = SPAN_DELIMITER.exec(raw))) {
    if (match.index > lastIndex) {
      const nativeText = raw.slice(lastIndex, match.index).trim();
      if (nativeText) spans.push({ text: nativeText, lang: 'native' });
    }
    const targetText = match[1].replace(/\([^)]*\)/g, '').trim();
    if (targetText) spans.push({ text: targetText, lang: 'target' });
    lastIndex = SPAN_DELIMITER.lastIndex;
  }
  if (lastIndex < raw.length) {
    const rest = raw.slice(lastIndex).trim();
    if (rest) spans.push({ text: rest, lang: 'native' });
  }
  return spans;
}

/**
 * Server-side validator: returns corrections for any text that fails to use
 * ⟦ ⟧ delimiters properly. Checks for target-language text outside delimiters
 * and native-language text inside delimiters.
 */
export function validateDelimiters(
  text: string,
  targetBcp47: string,
  nativeBcp47: string,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  const targetLang = targetBcp47.startsWith('ja') ? 'Japanese' :
    targetBcp47.startsWith('zh') ? 'Chinese' :
    targetBcp47.startsWith('ko') ? 'Korean' : 'Target';

  // Check for unmixed native text outside delimiters
  const outsideDelimiters = text.replace(SPAN_DELIMITER, ' ').trim();
  if (outsideDelimiterHasTargetScript(outsideDelimiters, targetBcp47)) {
    issues.push(`Target-language text (${targetLang}) found outside ⟦ ⟧ delimiters`);
  }

  // Check inside each span
  SPAN_DELIMITER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPAN_DELIMITER.exec(text))) {
    const inner = match[1];
    // Inside should be target language — warn if it's pure native
    const cleaned = inner.replace(/\([^)]*\)/g, '').trim();
    if (cleaned && !containsTargetScript(cleaned, targetBcp47)) {
      issues.push(`Content inside ⟦ ⟧ ("${cleaned}") does not appear to be ${targetLang}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function outsideDelimiterHasTargetScript(text: string, targetBcp47: string): boolean {
  // Remove common native-language tokens (explanations, connectors) to avoid false positives
  const nativeTokens = text
    .replace(/['']/g, '')
    .replace(/[.!?,;:]/g, ' ')
    .trim();
  if (!nativeTokens) return false;
  return containsTargetScript(nativeTokens, targetBcp47);
}

/**
 * Detect speech language for a single piece of text (used in replay).
 */
export function detectSpeechLang(text: string, targetBcp47: string, nativeBcp47: string): string {
  if (containsTargetScript(text, targetBcp47)) return targetBcp47;
  return nativeBcp47;
}
