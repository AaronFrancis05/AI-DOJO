/* ── Overview ───────────────────────────────────────────────────────────
   Gapless playback for the character's voice.

   Azure streams synthesized audio back in chunks. Playing each utterance
   through its own SpeakerAudioDestination — an HTMLAudioElement the SDK
   drives — put an audible seam at every utterance boundary, from two causes
   that no amount of buffering ahead could remove:

   1. Resuming a media element is not instantaneous even when its data is
      already there, and every utterance was a fresh element.
   2. The audio was MP3, which carries encoder delay and padding as silence
      at the head and tail of every clip.

   So playback moves to raw PCM scheduled on the Web Audio timeline instead.
   Every block is placed at an explicit start time on ONE shared cursor, and
   the cursor is module-level rather than per-utterance: the first block of
   utterance N+1 is scheduled at exactly the sample where utterance N's last
   block ended. The seam is not made small, it is made not to exist.

   That is also why this owns the cursor rather than lib/roleplay/tts.ts —
   gaplessness is a property of the sequence, not of any one utterance, so
   there has to be one place that knows where the last one ended.

   Kept apart from tts.ts (as lib/roleplay/sentence-split.ts is) so the
   sample conversion and cursor arithmetic can be tested against a stub
   context, without the Azure Speech SDK or a browser.
   ────────────────────────────────────────────────────────────────────── */

/** Matches Azure's Raw24Khz16BitMonoPcm, which is what tts.ts asks for. */
export const PCM_SAMPLE_RATE = 24000;

/**
 * How far ahead of the context clock a block may be scheduled at the earliest.
 *
 * Scheduling at exactly `currentTime` races the audio thread: a block whose
 * start time has already passed by the time the graph picks it up is played
 * late or dropped, which is a click. This is only ever paid when the cursor
 * has fallen behind — i.e. when the character was silent anyway.
 */
const LEAD_SEC = 0.05;

/** Only the parts of AudioContext this module uses, so tests can stub it. */
export interface PcmContext {
  readonly currentTime: number;
  readonly state?: string;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  resume?(): Promise<void>;
}

export interface PcmSink {
  /** Schedules one chunk of 16-bit little-endian mono PCM. */
  push(chunk: ArrayBuffer): void;
  /** No more chunks are coming. `finished` resolves once the audio plays out. */
  end(): void;
  /** Barge-in: silence this sink's audio and hand the cursor back. */
  stop(): void;
  /**
   * Milliseconds since this sink's first sample was due to play. Negative
   * before it starts. This is the clock the viseme timeline is walked against:
   * Azure's audioOffset is measured from the start of the utterance's audio,
   * which is exactly what this measures.
   */
  elapsedMs(): number;
  /** Whether any audio has been scheduled yet. */
  readonly started: boolean;
  /** Resolves when this sink's audio has finished playing, or was stopped. */
  readonly finished: Promise<void>;
}

const EMPTY_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array(0);

/**
 * The shared playback cursor: the time on `activeCtx`'s clock at which the
 * next scheduled block should begin. Module-level by design — see the header.
 */
let cursor = 0;
let activeCtx: PcmContext | null = null;

/** Resets the cursor. Call on barge-in, once every sink has been stopped. */
export function resetCursor(): void {
  cursor = 0;
}

/** Whether any scheduled audio is still due to play. */
export function isDraining(): boolean {
  return activeCtx !== null && cursor > activeCtx.currentTime;
}

/**
 * Resolves once every block scheduled so far has played out.
 *
 * Used for "the character has stopped talking", which per-utterance callbacks
 * can no longer answer: an utterance's synthesis now finishes long before its
 * audio does, and the next utterance is deliberately scheduled during that
 * gap. Only the cursor knows when the run actually ends.
 */
export function whenDrained(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const ctx = activeCtx;
      if (!ctx || cursor <= ctx.currentTime) { resolve(); return; }
      // Re-check rather than trusting one timeout: a suspended context stops
      // advancing currentTime, so the remaining time is not a countdown.
      setTimeout(check, Math.max(20, (cursor - ctx.currentTime) * 1000));
    };
    check();
  });
}

/**
 * Converts 16-bit little-endian PCM bytes to Float32 samples in [-1, 1).
 *
 * `carry` holds a trailing odd byte between calls. Chunk boundaries do not
 * have to fall on sample boundaries, and a dropped or misaligned byte shifts
 * every subsequent sample by one byte, which turns the rest of the utterance
 * into noise.
 */
export function decodePcm16(
  bytes: Uint8Array,
  carry: Uint8Array,
): { samples: Float32Array<ArrayBuffer>; carry: Uint8Array<ArrayBuffer> } {
  let buf: Uint8Array;
  if (carry.length) {
    buf = new Uint8Array(carry.length + bytes.length);
    buf.set(carry, 0);
    buf.set(bytes, carry.length);
  } else {
    buf = bytes;
  }

  const usable = buf.length - (buf.length % 2);
  // Copied into its own buffer rather than sliced as a view: the caller holds
  // this across calls, and a view would pin the whole chunk it came from.
  const nextCarry = usable === buf.length ? EMPTY_BYTES : new Uint8Array(buf.subarray(usable));

  const samples = new Float32Array(usable / 2);
  const view = new DataView(buf.buffer, buf.byteOffset, usable);
  for (let i = 0; i < samples.length; i++) {
    // Divide by 0x8000 both ways: it is the magnitude of the most negative
    // value, so full-scale negative maps to exactly -1 and nothing clips.
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }

  return { samples, carry: nextCarry };
}

/**
 * Opens a sink that schedules PCM onto the shared cursor.
 *
 * `connect` is handed each source node so the caller decides where the audio
 * goes — tts.ts routes it through the lip-sync analyser.
 */
export function createPcmSink(ctx: PcmContext, connect: (source: AudioNode) => void): PcmSink {
  activeCtx = ctx;
  if (ctx.state === 'suspended') void ctx.resume?.().catch(() => {});

  const live = new Set<AudioBufferSourceNode>();
  let carry: Uint8Array<ArrayBuffer> = EMPTY_BYTES;
  let startedAt = -1;
  let endsAt = 0;
  let ended = false;
  let stopped = false;
  let settle: (() => void) | null = null;
  let settled = false;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;

  const finished = new Promise<void>((resolve) => { settle = resolve; });

  const done = () => {
    if (settled) return;
    settled = true;
    // A barge-in resolves the sink long before its audio would have ended, so
    // the outstanding poll has to be cancelled rather than left to fire against
    // a sink nobody is waiting on any more.
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }
    settle?.();
  };

  /** Resolves `finished` when the last scheduled sample is due, not before. */
  const armFinish = () => {
    finishTimer = null;
    if (!ended || stopped || settled) return;
    // A closed context will never advance its clock again, so the audio this
    // is waiting on can no longer arrive. Polling on would hang the queue.
    if (ctx.state === 'closed') { done(); return; }
    const remainingMs = (endsAt - ctx.currentTime) * 1000;
    if (remainingMs <= 0) { done(); return; }
    finishTimer = setTimeout(armFinish, Math.max(20, remainingMs));
  };

  return {
    get started() { return startedAt >= 0; },
    finished,

    push(chunk: ArrayBuffer): void {
      if (stopped || ended) return;

      const decoded = decodePcm16(new Uint8Array(chunk), carry);
      carry = decoded.carry;
      if (!decoded.samples.length) return;

      const buffer = ctx.createBuffer(1, decoded.samples.length, PCM_SAMPLE_RATE);
      buffer.copyToChannel(decoded.samples, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      connect(source);

      // The cursor only ever jumps forward to meet the clock, never back. A
      // cursor still ahead of `currentTime` means the previous utterance is
      // mid-flight and this block butts straight onto it — the gapless case.
      const earliest = ctx.currentTime + LEAD_SEC;
      if (cursor < earliest) cursor = earliest;
      if (startedAt < 0) startedAt = cursor;

      source.start(cursor);
      cursor += buffer.duration;
      endsAt = cursor;

      live.add(source);
      source.onended = () => { live.delete(source); };
    },

    end(): void {
      if (stopped) return;
      ended = true;
      if (startedAt < 0) { done(); return; }
      armFinish();
    },

    stop(): void {
      if (stopped) return;
      stopped = true;
      for (const source of live) {
        try { source.stop(); } catch { /* never started, or already stopped */ }
      }
      live.clear();
      done();
    },

    elapsedMs(): number {
      if (startedAt < 0) return -1;
      return (ctx.currentTime - startedAt) * 1000;
    },
  };
}
