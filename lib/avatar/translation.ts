/**
 * lib/translation.ts — EN<->JA translation with tolerant multi-layer fallback.
 *
 * Port of translation.py. Keeps its own JSON-repair variant separate from
 * lib/json-utils.ts, same as the Python original (translation.py has its
 * own _normalize_json_like tuned for the {japanese, romanization} shape;
 * json_utils.py's variant is tuned for the {reply, expression, animation}
 * behavior object). Not deduplicated on purpose — mirrors the source.
 */
import { callLLM, aiAvailable, type LlmMessage } from "./ai";

// ---------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------

// Accept Japanese punctuation and fullwidth digits as valid Japanese text for
// translation validation, since outputs like counting may produce fullwidth
// digits or Japanese commas without hiragana/kanji.
const JP_PATTERN =
  /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF10-\uFF19]/;

interface TranslationResult {
  japanese: string;
  romanization: string;
}

const translationCache = new Map<string, TranslationResult | string>();

const MAX_CACHE_SIZE = 200;
const MAX_TRANSLATE_CHARS = 1000;

// Completely empty to stop false-positives on valid technical Japanese words
// like 機械学習 — kept as an (unused) Set for structural fidelity with the
// Python original, which defines this same always-empty set.
const SIMPLIFIED_ONLY_CHARS = new Set<string>();

// ---------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------

export function isJapanese(text: string): boolean {
  if (!text) return false;
  return JP_PATTERN.test(text);
}

/** Remove invalid unicode while preserving valid Japanese. */
function sanitizeText(text: string | null | undefined): string {
  if (!text) return "";
  let cleaned = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogate
    cleaned += ch;
  }
  return cleaned.trim();
}

/** Strip common translation label prefixes from a line of text. */
function stripTranslationLabelPrefix(text: string): string {
  if (!text) return text;
  text = text
    .replace(/^\s*(?:Japanese|日本語|Line\s*1)\s*[:\-]\s*/i, "")
    .trim();
  text = text
    .replace(/^\s*(?:Romaji|ローマ字|Reading|Line\s*2)\s*[:\-]\s*/i, "")
    .trim();
  return text;
}

/** Validate translation without rejecting legitimate technical Japanese. */
function isValidJapanese(text: string): boolean {
  if (!text) return false;
  text = sanitizeText(text);

  if (!isJapanese(text)) return false;

  // reject pure ASCII
  if (/^[A-Za-z0-9\s.,!?()'":;/\\-]+$/.test(text)) return false;

  // reject replacement characters
  if (text.includes("\ufffd")) return false;

  // reject simplified-only Chinese characters (always empty set, see above)
  if ([...text].some((ch) => SIMPLIFIED_ONLY_CHARS.has(ch))) return false;

  // reject absurd repetition
  if (/(.)\1{8,}/.test(text)) return false;

  return true;
}

function isPlaceholderText(text: string): boolean {
  text = (text ?? "").trim();
  if (!text) return true;
  if (["...", "…..", "……", "…", "-", "--", "---"].includes(text)) return true;
  if (/^[.。…\-\s]{1,8}$/.test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------
// JSON PARSING
// ---------------------------------------------------------------------

/** Clean malformed JSON returned by LLMs. */
function cleanLlmOutput(raw: string): string {
  let s = raw.trim();
  s = s.split("```json").join("");
  s = s.split("```").join("");
  s = s
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"');

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }

  s = s.split("\\n").join(" "); // literal backslash-n sequence
  s = s.replace(/\n/g, " "); // actual newline

  s = s.replace(/,\s*\}/g, "}");
  s = s.replace(/,\s*\]/g, "]");

  return s.trim();
}

function normalizeJsonLikeTranslation(raw: string): string {
  let normalized = cleanLlmOutput(raw);

  normalized = normalized
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"');

  normalized = normalized.replace(/(?<=\{|,)\s*'([^']+)'\s*:\s*/g, '"$1": ');
  normalized = normalized.replace(
    /:\s*'((?:[^'\\]|\\.)*)'(?=\s*[},])/g,
    ': "$1"'
  );
  normalized = normalized.replace(
    /(?<=\{|,)\s*([A-Za-z0-9_]+)\s*:\s*/g,
    '"$1": '
  );
  normalized = normalized.replace(/,\s*([}\]])/g, "$1");

  return normalized.trim();
}

function extractJsonFallback(raw: string): TranslationResult | null {
  let japanese = "";
  let romaji = "";

  let m = /"(?:japanese|translation|ja|text)"\s*:\s*"([^"]+)"/i.exec(raw);
  if (m) japanese = m[1].trim();

  if (!japanese) {
    const normalized = raw.replace(/\r/g, "\n");
    const patterns = [
      /(?:japanese|translation|ja|text)\s*[:=]\s*"([^"]+)"/i,
      /(?:japanese|translation|ja|text)\s*[:=]\s*'([^']+)'/i,
      /(?:japanese|translation|ja|text)\s*[:=]\s*([^\n,]+)/i,
    ];
    for (const p of patterns) {
      const mm = p.exec(normalized);
      if (mm) {
        japanese = stripTranslationLabelPrefix(mm[1].trim());
        break;
      }
    }
  }

  if (!japanese) {
    const jpLines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => isJapanese(l));
    if (jpLines.length) {
      const longest = jpLines.reduce((a, b) => (b.length > a.length ? b : a));
      japanese = stripTranslationLabelPrefix(longest);
    }
  }

  m = /"(?:romanization|romaji|reading)"\s*:\s*"([^"]+)"/i.exec(raw);
  if (m) romaji = stripTranslationLabelPrefix(m[1].trim());

  if (!romaji) {
    const normalized = raw.replace(/\r/g, "\n");
    const patterns = [
      /(?:romanization|romaji|reading)\s*[:=]\s*"([^"]+)"/i,
      /(?:romanization|romaji|reading)\s*[:=]\s*'([^']+)'/i,
      /(?:romanization|romaji|reading)\s*[:=]\s*([^\n,]+)/i,
    ];
    for (const p of patterns) {
      const mm = p.exec(normalized);
      if (mm) {
        romaji = stripTranslationLabelPrefix(mm[1].trim());
        break;
      }
    }
  }

  if (!romaji) {
    const latinLines: string[] = [];
    for (let line of raw.split("\n")) {
      line = line.trim();
      if (line.length > 3 && !isJapanese(line) && /[A-Za-z]/.test(line)) {
        latinLines.push(line);
      }
    }
    if (latinLines.length) romaji = stripTranslationLabelPrefix(latinLines[0]);
  }

  if (japanese) {
    return { japanese: sanitizeText(japanese), romanization: sanitizeText(romaji) };
  }

  // Try plain key/value extraction without JSON formatting.
  const normalized2 = raw.replace(/\r/g, "\n");
  for (const p of [
    /(?:japanese|translation|ja|text)\s*[:=]\s*"([^"]+)"/i,
    /(?:japanese|translation|ja|text)\s*[:=]\s*'([^']+)'/i,
    /(?:japanese|translation|ja|text)\s*[:=]\s*([^\n,]+)/i,
  ]) {
    const mm = p.exec(normalized2);
    if (mm) {
      japanese = mm[1].trim();
      break;
    }
  }

  for (const p of [
    /(?:romanization|romaji|reading)\s*[:=]\s*"([^"]+)"/i,
    /(?:romanization|romaji|reading)\s*[:=]\s*'([^']+)'/i,
    /(?:romanization|romaji|reading)\s*[:=]\s*([^\n,]+)/i,
  ]) {
    const mm = p.exec(normalized2);
    if (mm) {
      romaji = mm[1].trim();
      break;
    }
  }

  if (!japanese) {
    const lines = normalized2
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length) {
      if (lines.length >= 2 && isJapanese(lines[0]) && !isJapanese(lines[1])) {
        japanese = lines[0];
        romaji = lines[1];
      } else if (isJapanese(lines[0])) {
        japanese = lines[0];
      } else if (lines.length >= 2 && isJapanese(lines[1])) {
        japanese = lines[1];
      }
    }
  }

  if (!japanese) {
    const rawMatch =
      /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF10-\uFF19]+/.exec(
        raw
      );
    if (rawMatch) {
      japanese = rawMatch[0].trim();
      const suffix = raw.slice(rawMatch.index + rawMatch[0].length).trim();
      if (suffix) romaji = suffix.split("\n")[0].trim();
    }
  }

  if (japanese) {
    return { japanese: sanitizeText(japanese), romanization: sanitizeText(romaji) };
  }

  return null;
}

function parseTranslationJson(raw: string): TranslationResult | null {
  const cleaned = normalizeJsonLikeTranslation(raw);

  let data: unknown = null;
  try {
    data = JSON.parse(cleaned);
  } catch {
    data = null;
  }

  if (data === null) {
    return extractJsonFallback(raw);
  }

  if (Array.isArray(data)) {
    const found = data.find(
      (item) => item && typeof item === "object" && !Array.isArray(item)
    );
    data = found ?? null;
  }

  if (typeof data !== "object" || data === null) {
    return null;
  }

  const obj = data as Record<string, unknown>;
  let japanese = String(obj.japanese ?? obj.translation ?? obj.ja ?? obj.text ?? "");
  let romaji = String(obj.romanization ?? obj.romaji ?? obj.reading ?? "");

  japanese = sanitizeText(japanese);
  romaji = sanitizeText(romaji);

  if (!japanese) return null;

  return { japanese, romanization: romaji };
}

// ---------------------------------------------------------------------
// FALLBACK TRANSLATION (NON-JSON)
// ---------------------------------------------------------------------

/** Plain-text fallback when JSON mode fails. */
async function translateWithoutJson(text: string): Promise<TranslationResult | null> {
  try {
    const prompt =
      "You are a professional native Japanese translator.\n\n" +
      "Translate the user's English text into NATURAL Japanese.\n\n" +
      "Rules:\n" +
      "- Preserve the exact meaning.\n" +
      "- Use grammatically correct Japanese.\n" +
      "- Use polite Japanese (です・ます).\n" +
      "- Use common Kanji.\n" +
      "- Keep proper nouns such as Python, ChatGPT, OpenAI and Docker unchanged when appropriate.\n" +
      "- Never invent Japanese words.\n" +
      "- Never explain your answer.\n\n" +
      "Output EXACTLY TWO LINES.\n" +
      "Line 1: Japanese\n" +
      "Line 2: Romaji\n";

    const messages: LlmMessage[] = [
      { role: "system", content: prompt },
      { role: "user", content: text },
    ];

    const response = (await callLLM(messages, false)).trim();
    if (!response) return null;

    const parsed = parseTranslationJson(response);
    if (parsed && parsed.japanese) {
      const japanese = sanitizeText(parsed.japanese);
      const romaji = sanitizeText(parsed.romanization);
      if (isValidJapanese(japanese)) {
        return { japanese, romanization: romaji };
      }
    }

    const lines = response
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let japanese = "";
    let romaji = "";

    for (const line of lines) {
      const stripped = stripTranslationLabelPrefix(line);
      if (!japanese && isJapanese(stripped)) {
        japanese = stripped;
        continue;
      }
      if (japanese && !romaji) {
        romaji = stripTranslationLabelPrefix(line);
        break;
      }
    }

    if (!japanese) {
      const m = /(?:Japanese|日本語)\s*[:=]\s*(.+)/i.exec(response);
      if (m) japanese = stripTranslationLabelPrefix(m[1].trim());
    }
    if (!romaji) {
      const m = /(?:Romaji|ローマ字)\s*[:=]\s*(.+)/i.exec(response);
      if (m) romaji = stripTranslationLabelPrefix(m[1].trim());
    }

    if (!japanese) {
      const m = /^line\s*1\s*[:\-]\s*(.+)$/im.exec(response);
      if (m) japanese = stripTranslationLabelPrefix(m[1].trim());
    }
    if (!romaji) {
      const m = /^line\s*2\s*[:\-]\s*(.+)$/im.exec(response);
      if (m) romaji = stripTranslationLabelPrefix(m[1].trim());
    }

    if (!japanese) {
      const rawMatch =
        /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF10-\uFF19]+/.exec(
          response
        );
      if (rawMatch) {
        japanese = rawMatch[0].trim();
        const suffix = response.slice(rawMatch.index + rawMatch[0].length).trim();
        if (suffix && !romaji) {
          romaji = stripTranslationLabelPrefix(suffix.split("\n")[0].trim());
        }
      }
    }

    japanese = sanitizeText(japanese);
    romaji = sanitizeText(romaji);

    if (!japanese) return null;
    if (!isValidJapanese(japanese)) return null;

    return { japanese, romanization: romaji };
  } catch (e) {
    console.error("Fallback translation failed:", e);
    return null;
  }
}

// ---------------------------------------------------------------------
// CACHE
// ---------------------------------------------------------------------

function getFromCache(text: string): TranslationResult | undefined {
  const key = `en_ja:${text.slice(0, MAX_TRANSLATE_CHARS)}`;
  return translationCache.get(key) as TranslationResult | undefined;
}

function saveToCache(text: string, result: TranslationResult): void {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  const key = `en_ja:${text.slice(0, MAX_TRANSLATE_CHARS)}`;
  translationCache.set(key, result);
}

// ---------------------------------------------------------------------
// MAIN TRANSLATOR
// ---------------------------------------------------------------------

export async function translateToJapanese(text: string): Promise<TranslationResult> {
  if (!aiAvailable()) {
    return { japanese: text, romanization: "" };
  }

  if (!text.trim()) {
    return { japanese: "", romanization: "" };
  }

  if (isPlaceholderText(text)) {
    return { japanese: text, romanization: "" };
  }

  const cached = getFromCache(text);
  if (cached) return cached;

  const prompt = `
You are a PROFESSIONAL NATIVE JAPANESE TRANSLATOR.

Translate the user's English into natural Japanese.

Requirements
- Preserve the meaning exactly.
- Maintain absolute factual accuracy with political and institutional titles (e.g., ensure "President" is translated as 大統領 and "Prime Minister" as 首相/総理大臣—never mix them up).
- Use correct Japanese grammar and particles.
- Use polite Japanese (です・ます).
- Use common Japanese vocabulary.
- Never invent Japanese words.
- Never mix Chinese into the translation.
- Proper nouns such as Python, OpenAI, Linux, Docker, ChatGPT may remain unchanged.
- Return ONLY valid JSON.

Example
{
 "japanese":"私は毎日日本語を勉強しています。",
 "romanization":"Watashi wa mainichi nihongo o benkyou shiteimasu."
}
`;

  for (const [attempt, jsonModeFlag] of [
    [1, false],
    [2, true],
  ] as const) {
    try {
      const raw = await callLLM(
        [
          { role: "system", content: prompt },
          { role: "user", content: text },
        ],
        jsonModeFlag
      );

      const parsed = parseTranslationJson(raw);
      if (!parsed) {
        if (
          /forgot to include the text|provide the English text|send me the text|text you'd like me to translate|no input text|nothing to translate/i.test(
            raw
          )
        ) {
          console.warn(
            `Attempt ${attempt}: Translator indicated no input text was provided. Returning original text.`
          );
          return { japanese: text, romanization: "" };
        }
        console.warn(
          `Attempt ${attempt}: JSON parse failed. Raw translation response: ${raw.slice(0, 500)}`
        );
        continue;
      }

      let japanese = parsed.japanese;
      if (!japanese) {
        console.warn(
          `Attempt ${attempt}: Parsed translation response did not contain Japanese. Raw: ${raw.slice(0, 500)}`
        );
        continue;
      }

      japanese = sanitizeText(japanese);
      const romaji = sanitizeText(parsed.romanization);

      if (!isValidJapanese(japanese)) {
        console.warn(
          `Attempt ${attempt}: Validation failed. Japanese text: ${japanese.slice(0, 200)}`
        );
        continue;
      }

      const result: TranslationResult = { japanese, romanization: romaji };
      saveToCache(text, result);
      return result;
    } catch (e) {
      console.error(`Translation attempt ${attempt} failed:`, e);
    }
  }

  console.info("Trying fallback translator...");
  const fallback = await translateWithoutJson(text);

  if (fallback) {
    saveToCache(text, fallback);
    return fallback;
  }

  // When translation fails entirely, return the original English text as the
  // Japanese fallback, so the UI still has something safe to speak/render.
  console.error("Translation failed completely.");
  return { japanese: text, romanization: "" };
}

// ---------------------------------------------------------------------
// JAPANESE -> ENGLISH
// ---------------------------------------------------------------------

export async function translateToEnglish(text: string): Promise<string> {
  if (!aiAvailable()) return text;
  if (!text || !text.trim()) return "";

  const cacheKey = `ja_en:${text.slice(0, MAX_TRANSLATE_CHARS)}`;
  const cached = translationCache.get(cacheKey);
  if (typeof cached === "string") return cached;

  const prompt = `
You are a professional English translator.

Translate Japanese into fluent natural English.

Rules
- Preserve the original meaning.
- Use grammatically correct English.
- Do not summarize.
- Do not explain.
- Do not add information.
- Return ONLY the English translation.
`;

  try {
    const result = await callLLM(
      [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
      false
    );

    let english = result.trim();
    english = english.replace(/^"+|"+$/g, "");
    english = sanitizeText(english);

    if (!english) return text;

    if (translationCache.size >= MAX_CACHE_SIZE) {
      const oldest = translationCache.keys().next().value;
      if (oldest !== undefined) translationCache.delete(oldest);
    }
    translationCache.set(cacheKey, english);
    return english;
  } catch (e) {
    console.error("JA->EN translation failed:", e);
    return text;
  }
}