/* ── Overview ───────────────────────────────────────────────────────────
   Where a streaming reply may be cut into sentences for speech.

   Kept apart from lib/roleplay/tts.ts so it can be tested without the Azure
   Speech SDK, and because the one rule that matters here — never split a
   ⟦ ⟧ span — is about the reply's own markup, not about audio.
   ────────────────────────────────────────────────────────────────────── */

// A sentence terminator only ends a sentence if it is followed by whitespace
// or a closing delimiter. While the model is still generating, the end of the
// buffer is NOT a boundary: the "." of "1.5" or "Mr." sits at the end of the
// buffer for exactly as long as it takes the next chunk to arrive, and that
// window is enough to speak half a word as a sentence.
const SENTENCE_BOUNDARY = /[。！？.!?](?=\s|⟧)|\n/g;

// The flush pattern runs only after generation has finished, so there is no
// next chunk and end-of-buffer really does terminate the last sentence.
const SENTENCE_BOUNDARY_FINAL = /[。！？.!?](?=\s|⟧|$)|\n/g;

/**
 * Whether `index` falls inside a ⟦ ⟧ span that has been opened and not closed.
 *
 * A target-language line frequently contains several sentences —
 * ⟦Bonjour ! Enchanté.⟧ — and splitting on the "!" would produce the fragment
 * "⟦Bonjour !", whose opening delimiter no longer has a partner.
 * splitIntoLangSpans finds no span in that fragment, classifies the whole
 * thing as native, and the character's target-language line is then read aloud
 * in the learner's native voice.
 */
export function insideSpan(buffer: string, index: number): boolean {
  let open = false;
  for (let i = 0; i < index; i++) {
    const ch = buffer[i];
    if (ch === '⟦') open = true;
    else if (ch === '⟧') open = false;
  }
  return open;
}

/**
 * End index (exclusive) of the first sentence that may be split off, or -1 when
 * the buffer has no splittable sentence yet.
 *
 * Returning -1 while a span is still open is deliberate: the caller waits for
 * the closing ⟧ rather than speaking half a span.
 */
export function findSentenceEnd(buffer: string, isFinal: boolean): number {
  const boundary = isFinal ? SENTENCE_BOUNDARY_FINAL : SENTENCE_BOUNDARY;
  boundary.lastIndex = 0;
  let match: RegExpExecArray | null;
  // Every alternative consumes a character, so the scan always advances.
  while ((match = boundary.exec(buffer))) {
    const end = match.index + match[0].length;
    if (!insideSpan(buffer, end)) return end;
  }
  return -1;
}
