/**
 * Strips internal scaffolding from streamed AI text before it reaches the
 * learner: the 【VOCAB N】 bookkeeping marker, bracketed stage labels the model
 * echoes back out of the phase prompts ("[COACHING]", "[SCENE START]"), any
 * leaked meta labels like "TEACHER:" or "[Turn 3]", and stray markdown bold
 * markers. The reply-contract prompt tells the model to never output markdown,
 * but it occasionally leaks `**word**` anyway, which renders as literal
 * asterisks in captions/chat — strip it like the rest of the scaffolding. The
 * raw fullAiText (with markers) is still kept for engine-side state parsing.
 *
 * This is also what `cleanDisplay` runs, so a marker only has to be taught to
 * one regex to disappear from the live stream, the stored transcript, and the
 * text handed to TTS alike.
 */

/**
 * The icebreaker bookkeeping marker, in every shape the model actually emits.
 *
 * `buildIcebreakerPrompt` spells it "【VOCAB N】" with N standing for the word's
 * number, and models routinely write the letter through — 【VOCAB N2】 — or
 * reach for square brackets or a "#". That single miss is expensive twice
 * over: the learner reads the marker on screen, AND
 * `app/api/chat/stream/route.ts` cannot parse an index out of it, so the
 * icebreaker never advances on the model's own say-so and every word has to be
 * force-advanced by the retry ceiling instead. Matching all the shapes is what
 * keeps the phase machine tracking what the character is actually teaching.
 */
const VOCAB_MARKER_SOURCE = String.raw`[【\[]\s*VOCAB\s*(?:NO\.?|N|#)?\s*(\d+)?\s*[】\]]`;
const VOCAB_MARKER = new RegExp(VOCAB_MARKER_SOURCE, 'i');
const VOCAB_MARKER_GLOBAL = new RegExp(VOCAB_MARKER_SOURCE, 'gi');

/**
 * Bracketed ALL-CAPS stage labels — "[COACHING]", "[SCENE START]",
 * "[SCENE CONTINUES]", "[SCENE END]".
 *
 * The phase prompts describe a reply's parts under headings of exactly that
 * shape ("1. COACHING", "2. THE SCENE"), and the model echoes them into the
 * reply itself, where they are rendered in the transcript AND read aloud by
 * TTS. Nothing the learner is meant to hear is ever a bracketed all-caps
 * token: the placeholder guard already forbids "[Name]"-style artifacts, and
 * the ⟦ ⟧ delimiters carry the only markup a reply legitimately has. The
 * prompts now forbid these labels outright (see NO_META_LABELS in
 * ./prompts/shared.ts) — this is the net under that.
 */
const STAGE_LABEL = /[【\[]\s*[A-Z]{3,}(?:[ /&'’-]+[A-Z]+)*\s*[】\]]\s*/g;

/**
 * The word number carried by an icebreaker marker, or null when the reply has
 * no parseable marker. Exported so the route reads the marker through the same
 * pattern that strips it — a shape one of them understands and the other
 * doesn't is exactly the bug this consolidates.
 */
export function parseVocabMarker(text: string): number | null {
  const digits = text.match(VOCAB_MARKER)?.[1];
  if (!digits) return null;
  const index = Number(digits);
  return Number.isFinite(index) ? index : null;
}

export function sanitizeStreamedChunk(text: string): string {
  return text
    .replace(VOCAB_MARKER_GLOBAL, '')
    .replace(STAGE_LABEL, '')
    .replace(/^(?:TEACHER|STUDENT|COACH|ASSISTANT|AI|SYSTEM)\s*:\s*/gim, '')
    .replace(/\[Turn\s*\d+\]\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/ {2,}/g, ' ');
}

const STREAM_TAIL_LABELS = ['TEACHER', 'STUDENT', 'COACH', 'ASSISTANT', 'AI', 'SYSTEM'] as const;

export interface StreamTextSanitizer {
  push(chunk: string): string;
  flush(): string;
}

/**
 * Stateful sanitizer for streamed AI text. Sanitizing each chunk independently
 * leaks half-arrived scaffolding when the provider splits a 【VOCAB N】 marker,
 * "TEACHER:" label, or "[Turn N]" marker across chunk boundaries. This buffers
 * raw text and only emits the sanitized delta once the in-flight marker/label
 * is complete, while the raw fullAiText stays available for engine-side parsing.
 */
export function createStreamTextSanitizer(): StreamTextSanitizer {
  let raw = '';
  let emitted = '';

  // How much of the raw buffer is safe to sanitize now? Everything after this
  // index is held back because it might be a half-arrived marker or label. Any
  // unclosed 【 or [ is held back — a marker like 【VOCAB N】 or [Turn N] can be
  // split at any character, so we wait for the closer before emitting.
  const safeLength = (text: string): number => {
    let safe = text.length;
    for (const [open, close] of [['【', '】'], ['[', ']']] as const) {
      const idx = text.lastIndexOf(open);
      if (idx !== -1 && !text.slice(idx + open.length).includes(close)) {
        safe = Math.min(safe, idx);
      }
    }
    // An odd number of ** so far means a bold span is still open — hold back
    // from its opening marker so the leading "**" doesn't get emitted before
    // its closer arrives (which would otherwise leak literal asterisks for
    // one chunk, then vanish once the pair completes and gets stripped).
    const asteriskPairs = (text.match(/\*\*/g) ?? []).length;
    if (asteriskPairs % 2 === 1) {
      safe = Math.min(safe, text.lastIndexOf('**'));
    }
    // Role labels only matter at the start of a line; hold back a line that is
    // still a partial label or a finished label (with colon) awaiting content.
    const lineStart = text.lastIndexOf('\n') + 1;
    const upper = text.slice(lineStart).toUpperCase();
    const stripped = upper.replace(/\s+$/, '');
    const isPartialLabel = STREAM_TAIL_LABELS.some(l =>
      (upper.length > 0 && upper.length < l.length && l.startsWith(upper)) ||
      stripped === l || stripped === `${l}:`
    );
    if (isPartialLabel) safe = Math.min(safe, lineStart);
    return safe;
  };

  return {
    push(chunk: string): string {
      raw += chunk;
      const safe = safeLength(raw);
      const sanitized = sanitizeStreamedChunk(raw.slice(0, safe));
      const delta = sanitized.slice(emitted.length);
      emitted = sanitized;
      return delta;
    },
    flush(): string {
      const safe = safeLength(raw);
      const sanitized = sanitizeStreamedChunk(raw.slice(0, safe));
      const delta = sanitized.slice(emitted.length);
      emitted = sanitized;
      raw = '';
      return delta;
    },
  };
}
