import { getPlaybackContext } from './tts';

/* ── Push-to-talk earcons ───────────────────────────────────────────────
   The two short blips that confirm the mic opened and closed.

   Synthesized rather than loaded as audio files: a press has to be confirmed
   in the same frame it happens, and a fetch + decode on the first press is
   exactly the lag this feedback exists to disprove. They share the playback
   AudioContext with the character's voice, connected straight to the output
   so the lip-sync analyser never sees them.

   Both are brief and quiet by design — the microphone is live while they
   play, and echo cancellation on the shared input stream keeps them out of
   the transcript.
   ────────────────────────────────────────────────────────────────────── */

// Rising = opening, falling = closing. The pair reads as one gesture.
const PRESS_TONE = { from: 660, to: 1046, durationSec: 0.07 };
const RELEASE_TONE = { from: 940, to: 587, durationSec: 0.09 };

const PEAK_GAIN = 0.12;
const ATTACK_SEC = 0.012;
const SILENCE = 0.0001;

function blip({ from, to, durationSec }: { from: number; to: number; durationSec: number }): void {
  try {
    const ctx = getPlaybackContext();
    // A press is itself a user gesture, so this resume is always permitted.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + durationSec);

    // Starting or stopping an oscillator at full amplitude clicks; ramp both
    // ends. exponentialRamp cannot reach 0, hence the near-silent floor.
    gain.gain.setValueAtTime(SILENCE, now);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, now + ATTACK_SEC);
    gain.gain.exponentialRampToValueAtTime(SILENCE, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* already torn down */ }
    };
  } catch {
    // Feedback only: a browser that refuses to play it must never take the
    // microphone down with it.
  }
}

/** Confirms the mic just opened. Play on press, before anything is awaited. */
export function playMicPress(): void {
  blip(PRESS_TONE);
}

/** Confirms the mic just closed and the turn is being transcribed. */
export function playMicRelease(): void {
  blip(RELEASE_TONE);
}
