/* ── Overview ───────────────────────────────────────────────────────────
   Where a streaming reply may be cut into sentences for speech.

   Kept apart from lib/roleplay/tts.ts so it can be tested without the Azure
   Speech SDK, and because the one rule that matters here — never split a
   ⟦ ⟧ span — is about the reply's own markup, not about audio.
   ────────────────────────────────────────────────────────────────────── */

// An ASCII sentence terminator only ends a sentence if it is followed by
// whitespace or a closing delimiter. While the model is still generating, the
// end of the buffer is NOT a boundary: the "." of "1.5" or "Mr." sits at the
// end of the buffer for exactly as long as it takes the next chunk to arrive,
// and that window is enough to speak half a word as a sentence.
//
// The full-width terminators are deliberately NOT under that lookahead. CJK
// text does not put a space after 。 — real output reads これは挨拶です。言って
// みましょう — so requiring one meant no boundary was ever found in a Japanese,
// Chinese or Korean reply while it streamed. findSentenceEnd returned -1 for
// the whole generation and the first audio only arrived at the final flush,
// making time-to-first-audio equal to time-to-last-token for the three
// languages, Japanese included, that lead lib/language.ts. They can afford to
// go without the lookahead because they are unambiguous: there is no "1。5"
// and no "Mr。" to guard against.
const SENTENCE_BOUNDARY = /[。！？]|[.!?](?=\s|⟧)|\n/g;

// The flush pattern runs only after generation has finished, so there is no
// next chunk and end-of-buffer really does terminate the last sentence.
const SENTENCE_BOUNDARY_FINAL = /[。！？]|[.!?](?=\s|⟧|$)|\n/g;

/* ── The no-terminator fallback ─────────────────────────────────────────
   Thai, Khmer, Burmese and Lao (th, km, my, lo in lib/language.ts) write
   without sentence-ending punctuation at all, so no terminator rule of any
   kind can find a boundary in them — they would keep the whole reply buffered
   until the final flush exactly as CJK used to. They do break phrases with
   spaces, which is enough to speak on.

   This is a safety valve, not the primary rule: it only engages once the
   buffer has grown past a cap no ordinary sentence reaches, so a language
   with real terminators never reaches it.
   ────────────────────────────────────────────────────────────────────── */
const MAX_UNSPLIT_CHARS = 160;

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
 * Last phrase break inside the first MAX_UNSPLIT_CHARS of an over-long buffer
 * that has no terminator anywhere, or -1 when there is nothing safe to break
 * on. A buffer at or under the cap always returns -1: the next chunk may well
 * carry the terminator, and splitting early costs prosody for nothing.
 *
 * Span state is tracked in the same forward pass rather than by calling
 * insideSpan per candidate, which would rescan the buffer once per character.
 */
function findFallbackSplit(buffer: string): number {
  if (buffer.length <= MAX_UNSPLIT_CHARS) return -1;

  let open = false;
  let lastBreak = -1;

  for (let i = 0; i < MAX_UNSPLIT_CHARS; i++) {
    const ch = buffer[i];
    if (ch === '⟦') open = true;
    // The character after a closing ⟧ is a break even with no space around it,
    // which is the only break a ⟦target⟧これは-shaped line offers.
    else if (ch === '⟧') { open = false; lastBreak = i + 1; }
    else if (!open && /\s/.test(ch)) lastBreak = i;
  }

  return lastBreak > 0 ? lastBreak : -1;
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
  return findFallbackSplit(buffer);
}
