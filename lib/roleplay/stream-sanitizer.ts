/**
 * Strips internal scaffolding from streamed AI text before it reaches the
 * learner: the 【VOCAB N】 bookkeeping marker and any leaked meta labels like
 * "TEACHER:" or "[Turn 3]". Only the exact 【VOCAB N】 marker is stripped — any
 * other 【...】 text is legitimate content (e.g. Japanese quotation marks). The
 * raw fullAiText (with markers) is still kept for engine-side state parsing.
 */
export function sanitizeStreamedChunk(text: string): string {
  return text
    .replace(/【VOCAB\s+\d+】/g, '')
    .replace(/^(?:TEACHER|STUDENT|COACH|ASSISTANT|AI|SYSTEM)\s*:\s*/gim, '')
    .replace(/\[Turn\s*\d+\]\s*/g, '')
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