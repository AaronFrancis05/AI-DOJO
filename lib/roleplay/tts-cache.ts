/* ── Overview ───────────────────────────────────────────────────────────
   In-tab cache of the character's already-synthesized speech.

   Live TTS is a sequence of utterances (sentence groups), each a raw PCM
   clip plus the viseme timeline that was collected while synthesizing it.
   Replay walks that same array instead of calling Azure again — so the
   learner hears what they heard, and the avatar's mouth keeps moving.

   Nothing here is durable. The session views clear the map on unmount.
   A barge-in or mute discards the in-progress turn rather than storing a
   truncated last sentence.
   ────────────────────────────────────────────────────────────────────── */

export type VisemeFrame = { id: number; offsetMs: number };

export type TtsClip = {
  pcm: ArrayBuffer;
  visemes: VisemeFrame[];
};

export function normalizeTtsCacheKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function concatPcmChunks(chunks: readonly ArrayBuffer[]): ArrayBuffer {
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

export function createTtsTurnCache() {
  let capturing = false;
  let aborted = false;
  let pending: Array<TtsClip | null> = [];
  const stored = new Map<string, TtsClip[]>();

  return {
    start(): void {
      capturing = true;
      aborted = false;
      pending = [];
    },

    isCapturing(): boolean {
      return capturing && !aborted;
    },

    discard(): void {
      capturing = false;
      aborted = true;
      pending = [];
    },

    /**
     * Takes the next playback slot. Must run before any `await` in the
     * synthesizer so two utterances preparing in parallel keep queue order
     * even if Azure finishes the later, shorter one first.
     *
     * Returns -1 when nothing is being captured; `fill` then no-ops.
     */
    reserve(): number {
      if (!capturing || aborted) return -1;
      pending.push(null);
      return pending.length - 1;
    },

    fill(index: number, pcm: ArrayBuffer, visemes: readonly VisemeFrame[]): void {
      if (!capturing || aborted || index < 0 || index >= pending.length || pcm.byteLength === 0) return;
      pending[index] = {
        pcm,
        visemes: visemes.map((frame) => ({ id: frame.id, offsetMs: frame.offsetMs })),
      };
    },

    pushClip(pcm: ArrayBuffer, visemes: readonly VisemeFrame[]): void {
      this.fill(this.reserve(), pcm, visemes);
    },

    commit(text: string): void {
      const key = normalizeTtsCacheKey(text);
      const clips = pending.filter((clip): clip is TtsClip => clip != null);
      capturing = false;
      pending = [];
      if (aborted || !key || clips.length === 0) return;
      stored.set(key, clips);
    },

    get(text: string): TtsClip[] | undefined {
      const clips = stored.get(normalizeTtsCacheKey(text));
      return clips && clips.length > 0 ? clips : undefined;
    },

    clear(): void {
      capturing = false;
      aborted = false;
      pending = [];
      stored.clear();
    },
  };
}

export const ttsTurnCache = createTtsTurnCache();
