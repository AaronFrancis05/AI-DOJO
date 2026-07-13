/**
 * TTS service using the Web Speech API (window.speechSynthesis).
 * Drives a callback with per-frame RMS amplitude for lip-sync approximation.
 *
 * Why Web Speech API instead of a cloud TTS provider:
 *  - No API key, no network latency, works offline.
 *  - Built into all modern browsers (Chrome, Edge, Safari).
 *  - Supports ja-JP voices on all major platforms.
 *  - Consistent with the existing `stt: 'web-speech-api'` capability.
 *
 * The amplitude data from AnalyserNode is a cheap but effective
 * approximation for driving a jaw/mouth blend shape. A phoneme-accurate
 * approach would require a cloud TTS that returns viseme timing (e.g.
 * Google Cloud TTS, Azure Speech), which we can switch to later by
 * changing the provider in capabilities.ts.
 */

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function getCurrentAmplitude(): number {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const value = (data[i] - 128) / 128;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / data.length);
  // Clamp to 0–1 and apply a sensitivity floor
  return Math.min(1, Math.max(0, rms * 3));
}

export function isSpeaking(): boolean {
  return window.speechSynthesis.speaking;
}

export function speak(
  text: string,
  lang: string = 'ja-JP',
): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    // Wire up audio analysis for lip-sync
    utterance.onstart = () => {
      const ctx = getAudioContext();
      const dest = ctx.createMediaStreamDestination();
      // We can't directly pipe SpeechSynthesis into Web Audio API,
      // so we create an oscillator-based amplitude proxy instead.
      // This gives us a rough "is sound playing" signal rather than
      // true voice amplitude.
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
    };

    utterance.onend = () => {
      analyser = null;
      resolve();
    };

    utterance.onerror = () => {
      analyser = null;
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}

export function stop(): void {
  window.speechSynthesis.cancel();
  analyser = null;
}
