'use client';

import {
  feedStreamTts,
  flushStreamTts,
  resetStreamingTts,
  speakMixedText,
} from './tts';

/* ── Overview ───────────────────────────────────────────────────────────
   One way for every voice surface to speak the character's reply.

   The four surfaces (session voice/avatar, tryout voice/avatar) each used to
   call speakMixedText in their own `onTextDone` handler, which means synthesis
   could not start until the ENTIRE model response had finished generating:
   time-to-first-audio was exactly time-to-last-token. lib/roleplay/tts.ts
   already contained the fix — feedStreamTts/flushStreamTts synthesize each
   completed sentence while the model is still writing the next one — and had
   no callers at all.

   This wraps that pair so a page only has to say "here is a delta" and "the
   reply is finished", and so the kill switch lives in one place rather than in
   four copies of the same branch.
   ────────────────────────────────────────────────────────────────────── */

/**
 * `NEXT_PUBLIC_STREAM_TTS=0` reverts every surface to speaking the reply as a
 * single clip after generation, without a rollback. Anything else (including
 * unset) streams.
 */
export function isStreamTtsEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_STREAM_TTS;
  return flag !== '0' && flag !== 'false';
}

export interface ReplySpeakerOptions {
  targetBcp47: string;
  nativeBcp47: string;
  phase: string;
  /**
   * Read at each call rather than captured, so muting part-way through a reply
   * stops the sentences that haven't been synthesized yet.
   */
  isMuted: () => boolean;
}

export interface ReplySpeaker {
  /** Feed just-arrived reply text. Returns immediately; never blocks the stream. */
  feed(delta: string): void;
  /**
   * The reply is complete. Speaks whatever is left and resolves when the
   * character has actually stopped talking.
   *
   * `fullText` is only used when nothing was ever fed — the tryout turn
   * endpoint answers with one JSON body rather than a token stream, so its
   * reply arrives whole. When deltas were fed, they are what gets spoken: the
   * queue is already several sentences ahead by this point.
   */
  finish(fullText: string): Promise<void>;
}

/**
 * Starts a reply. Call once per turn, AFTER stopping whatever was being said —
 * `stop()` latches the stream closed, and this is what re-opens it.
 */
export function createReplySpeaker(options: ReplySpeakerOptions): ReplySpeaker {
  const { targetBcp47, nativeBcp47, phase, isMuted } = options;
  const streaming = isStreamTtsEnabled();
  let fed = false;

  resetStreamingTts();

  return {
    feed(delta: string): void {
      if (!streaming || !delta || isMuted()) return;
      fed = true;
      feedStreamTts(delta, targetBcp47, nativeBcp47, phase);
    },

    async finish(fullText: string): Promise<void> {
      if (isMuted()) return;

      if (streaming) {
        // A non-streaming source (tryout) delivers the whole reply here. Push
        // it through the same buffer so both kinds of surface speak by one
        // path, then flush.
        if (!fed && fullText) feedStreamTts(fullText, targetBcp47, nativeBcp47, phase);
        await flushStreamTts(targetBcp47, nativeBcp47, phase);
        return;
      }

      if (fullText) await speakMixedText(fullText, targetBcp47, nativeBcp47, phase);
    },
  };
}
