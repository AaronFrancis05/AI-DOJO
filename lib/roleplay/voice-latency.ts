'use client';

/**
 * One measurement, taken end to end: how long the learner waits between letting
 * go of the mic and hearing the character start talking.
 *
 * It lives here rather than inside either half because the two ends sit in
 * different layers — `lib/hooks/useVoiceInput.ts` owns the release,
 * `lib/roleplay/tts.ts` owns the first sample of audio — and neither may import
 * the other (nor a component). `useLatencyMonitor` subscribes and renders it,
 * so the voice path stops being guesswork about the network.
 */

let releasedAt = 0;
const listeners = new Set<(ms: number) => void>();

/** Called on the mic release that transmits an utterance. */
export function markMicRelease(): void {
  releasedAt = Date.now();
}

/**
 * Called when the character's first audio of a reply actually starts playing.
 * A no-op unless a release is outstanding, so replays, the recap line and the
 * opening greeting — none of which follow a mic press — report nothing.
 */
export function markFirstAudio(): void {
  if (!releasedAt) return;
  const elapsed = Date.now() - releasedAt;
  releasedAt = 0;
  for (const fn of listeners) fn(elapsed);
}

/** Drops an outstanding release, e.g. a turn that errored before it spoke. */
export function clearMicRelease(): void {
  releasedAt = 0;
}

export function subscribeTurnLatency(fn: (ms: number) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
