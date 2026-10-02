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

/**
 * Whether `containsTargetScript` can actually answer for this target language.
 * It only implements the CJK scripts, so for every other target — French,
 * Spanish, Swahili — it returns false for text that IS in the target language.
 *
 * Callers that use script detection to tell a target-language span from a
 * native-language one must gate on this and fall back to the ⟦ ⟧ span markers,
 * or they will classify every span of a Latin-script target as native.
 */
export function hasDetectableScript(targetBcp47: string): boolean {
  return targetBcp47.startsWith('ja')
    || targetBcp47.startsWith('zh')
    || targetBcp47.startsWith('ko');
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

export function hasLangSpanDelimiters(raw: string): boolean {
  return /⟦[^⟧]*⟧/.test(raw);
}

/**
 * Voice spans for mixed TTS.
 *
 * `splitIntoLangSpans` labels unmarked text as native, which is right when the
 * session model wraps target lines in ⟦ ⟧. Tryout replies have no markers, so
 * that rule would send Japanese (the bold target line) to the English voice.
 *
 * Undelimited CJK+Latin mixes (e.g. 「Nice to meet you」 inside a Japanese
 * teaching line) are split by script so the English gloss uses the native
 * voice instead of a Japanese voice reading English.
 */
export function resolveSpeechSpans(
  raw: string,
  targetBcp47: string,
  nativeBcp47: string,
): LangSpan[] {
  const text = raw.trim();
  if (!text) return [];
  if (targetBcp47 === nativeBcp47) return [{ text, lang: 'target' }];
  if (hasLangSpanDelimiters(text)) return splitIntoLangSpans(text);
  if (!hasDetectableScript(targetBcp47)) return [{ text, lang: 'target' }];
  if (!containsTargetScript(text, targetBcp47)) return [{ text, lang: 'native' }];
  return splitUndelimitedByScript(text, targetBcp47);
}

const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;
/** Short Latin tokens ("OK", "AI") stay on the target voice. */
const MIN_LATIN_NATIVE_LETTERS = 3;

function isTargetScriptChar(ch: string, targetBcp47: string): boolean {
  if (targetBcp47.startsWith('ja')) {
    return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(ch);
  }
  if (targetBcp47.startsWith('zh')) {
    return /[\u4e00-\u9fff]/.test(ch);
  }
  if (targetBcp47.startsWith('ko')) {
    return /[\uac00-\ud7af]/.test(ch);
  }
  return false;
}

function latinLetterCount(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (LATIN_LETTER.test(ch)) n += 1;
  }
  return n;
}

/**
 * Walks an undelimited CJK reply and cuts out Latin-letter runs so mixed
 * teaching lines can switch voice mid-utterance.
 */
export function splitUndelimitedByScript(text: string, targetBcp47: string): LangSpan[] {
  const runs: LangSpan[] = [];
  let lang: 'target' | 'native' | null = null;
  let buf = '';

  const flush = () => {
    if (!buf || !lang) {
      buf = '';
      return;
    }
    let nextLang = lang;
    if (nextLang === 'native' && latinLetterCount(buf) < MIN_LATIN_NATIVE_LETTERS) {
      nextLang = 'target';
    }
    const prev = runs[runs.length - 1];
    if (prev && prev.lang === nextLang) prev.text += buf;
    else runs.push({ text: buf, lang: nextLang });
    buf = '';
  };

  for (const ch of text) {
    const next: 'target' | 'native' | null = isTargetScriptChar(ch, targetBcp47)
      ? 'target'
      : LATIN_LETTER.test(ch)
        ? 'native'
        : null;
    if (next && next !== lang) {
      flush();
      lang = next;
    } else if (lang === null) {
      lang = next ?? 'target';
    }
    buf += ch;
  }
  flush();
  return runs.filter((s) => s.text.trim());
}

/**
 * Server-side validator: returns corrections for any text that fails to use
 * ⟦ ⟧ delimiters properly. Checks for target-language text outside delimiters
 * and native-language text inside delimiters.
 */
export function validateDelimiters(
  text: string,
  targetBcp47: string,
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

  // Check inside each span. Only where the script can actually answer:
  // containsTargetScript is CJK-only, so for a French or Swahili target this
  // reported every correctly-delimited target-language span as wrong, once per
  // span, on every turn.
  if (hasDetectableScript(targetBcp47)) {
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
