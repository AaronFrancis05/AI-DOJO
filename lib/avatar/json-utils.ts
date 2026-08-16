/**
 * lib/json-utils.ts — shared helpers for cleaning up and parsing the loosely-formed
 * JSON an LLM sometimes returns (smart quotes, single quotes, trailing commas,
 * stray prose around the object, code fences, etc).
 *
 * Port of the Python json_utils.py used by the FastAPI backend's behavior
 * parser ({reply, expression, animation}). Kept dependency-free so lib/ai.ts,
 * lib/translation.ts, and lib/behavior.ts can all import it safely.
 */

const QUOTE_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
};

export function stripFences(raw: string): string {
  let clean = raw.trim();
  for (const fence of ["```json", "```"]) {
    clean = clean.split(fence).join("");
  }
  return clean.trim();
}

export function normalizeJsonLike(raw: string): string {
  let normalized = stripFences(raw);

  for (const [smart, plain] of Object.entries(QUOTE_MAP)) {
    normalized = normalized.split(smart).join(plain);
  }

  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start !== -1 && end > start) {
    normalized = normalized.slice(start, end + 1);
  }

  // 'key': -> "key":
  normalized = normalized.replace(/(?<=\{|,)\s*'([^']+)'\s*:\s*/g, '"$1": ');

  // : 'value' -> : "value"  (preserving apostrophes/escapes inside the value)
  normalized = normalized.replace(
    /:\s*'((?:\\.|[^'])*?)'\s*(?=[,}])/gs,
    (_match, rawVal: string) => {
      const escaped = rawVal.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `: "${escaped}"`;
    }
  );

  // bare_key: -> "bare_key":
  normalized = normalized.replace(/(?<=\{|,)\s*([A-Za-z0-9_]+)\s*:\s*/g, '"$1": ');

  // trailing commas
  normalized = normalized.replace(/,\s*\}/g, "}");
  normalized = normalized.replace(/,\s*\]/g, "]");

  return normalized.trim();
}

/**
 * Pull out `"field_name": "<value>"` (or single-quoted) from raw, malformed text.
 * Manual scan (not a single regex) so it handles escaped quotes inside the value
 * correctly, same as the Python version.
 */
export function extractQuotedValue(text: string, fieldName: string): string | null {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fieldPattern = new RegExp(`['"]${escapedField}['"]\\s*:\\s*`, "i");
  const match = fieldPattern.exec(text);
  if (!match) return null;

  let index = match.index + match[0].length;
  while (index < text.length && /\s/.test(text[index])) index++;
  if (index >= text.length || (text[index] !== "'" && text[index] !== '"')) {
    return null;
  }

  const quote = text[index];
  index += 1;
  const valueChars: string[] = [];
  let escaped = false;

  while (index < text.length) {
    const ch = text[index];
    index += 1;
    if (escaped) {
      valueChars.push(ch);
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === quote) {
      return valueChars.join("");
    }
    valueChars.push(ch);
  }
  return null;
}