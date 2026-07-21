import {
  containsTargetScript,
  splitIntoLangSpans,
  detectSpeechLang as detectLang,
  type LangSpan,
} from './lang-detect';

let currentVisemeId = -1;
let isAzureSpeaking = false;
let azureStopCallback: (() => void) | null = null;

let currentGeneration = 0;

export type SpeakingCallback = (speaking: boolean) => void;
let onSpeakingChange: SpeakingCallback | null = null;

export function setOnSpeakingChange(cb: SpeakingCallback | null): void {
  onSpeakingChange = cb;
}

function notifySpeaking(speaking: boolean): void {
  if (onSpeakingChange) onSpeakingChange(speaking);
}

export function getCurrentViseme(): number {
  return currentVisemeId;
}

export function isSpeaking(): boolean {
  return isAzureSpeaking || window.speechSynthesis.speaking;
}

export function speak(text: string, lang: string = 'ja-JP'): Promise<void> {
  return new Promise((resolve) => {
    notifySpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onend = () => { notifySpeaking(false); resolve(); };
    utterance.onerror = () => { notifySpeaking(false); resolve(); };
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakWithVisemes(
  text: string,
  lang: string = 'ja-JP',
): Promise<void> {
  stop();
  const myGeneration = ++currentGeneration;

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    });

    if (!response.ok) throw new Error(`Azure TTS returned ${response.status}`);

    const data = await response.json();
    const { audio: audioBase64, visemes } = data;

    if (myGeneration !== currentGeneration) return;

    const binaryStr = atob(audioBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);

    if (myGeneration !== currentGeneration) {
      audioCtx.close();
      return;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start(0);

    isAzureSpeaking = true;
    notifySpeaking(true);
    currentVisemeId = -1;

    const startTime = audioCtx.currentTime;
    let visemeIndex = 0;

    const cancelled = { value: false };
    azureStopCallback = () => {
      cancelled.value = true;
      try { source.stop(); } catch {}
      audioCtx.close();
    };

    return new Promise((resolve) => {
      const tick = () => {
        if (cancelled.value || myGeneration !== currentGeneration) {
          if (myGeneration === currentGeneration) {
            currentVisemeId = -1;
            isAzureSpeaking = false;
            notifySpeaking(false);
          }
          resolve();
          return;
        }

        const elapsed = (audioCtx.currentTime - startTime) * 1000;

        while (visemeIndex < visemes.length && visemes[visemeIndex].offsetMs <= elapsed) {
          currentVisemeId = visemes[visemeIndex].id;
          visemeIndex++;
        }

        if (visemeIndex >= visemes.length) {
          currentVisemeId = -1;
          isAzureSpeaking = false;
          notifySpeaking(false);
          resolve();
          return;
        }

        requestAnimationFrame(tick);
      };

      tick();

      source.onended = () => {
        if (!cancelled.value && myGeneration === currentGeneration) {
          currentVisemeId = -1;
          isAzureSpeaking = false;
          notifySpeaking(false);
          resolve();
        }
      };
    });
  } catch {
    if (myGeneration === currentGeneration) {
      currentVisemeId = -1;
      isAzureSpeaking = false;
      notifySpeaking(false);
    }
    return speak(text, lang);
  }
}

export function stop(): void {
  currentGeneration++;
  if (azureStopCallback) {
    azureStopCallback();
    azureStopCallback = null;
  }
  window.speechSynthesis.cancel();
  currentVisemeId = -1;
  isAzureSpeaking = false;
  notifySpeaking(false);
  stopStreamingTts();
}

/* ── Span-based mixed-language speech ──────────────────── */

function spanVoiceFor(lang: 'target' | 'native', targetBcp47: string, nativeBcp47: string, phase: string): string {
  if (phase === 'unguided') return targetBcp47;
  return lang === 'target' ? targetBcp47 : nativeBcp47;
}

/**
 * Speak a text that may contain mixed ⟦target (romaji)⟧ and native-language spans.
 * Correctly voices each span with the right accent.
 */
export async function speakMixedText(
  raw: string,
  targetBcp47: string,
  nativeBcp47: string,
  phase: string = 'guided',
): Promise<void> {
  const spans = splitIntoLangSpans(raw);

  if (spans.length === 0) {
    const lang = detectLang(raw, targetBcp47, nativeBcp47);
    try {
      await speakWithVisemes(raw, lang);
    } catch {
      await speak(raw, lang);
    }
    return;
  }

  for (const span of spans) {
    const voiceLang = spanVoiceFor(span.lang, targetBcp47, nativeBcp47, phase);
    try {
      await speakWithVisemes(span.text, voiceLang);
    } catch {
      await speak(span.text, voiceLang);
    }
  }
}

/* ── Streaming TTS ────────────────────────────────────── */

let streamTtsBuffer = '';
let streamTtsBusy = false;
let streamTtsStopped = false;
const SENTENCE_BOUNDARY = /[。！？.!?\n]/;

async function processStreamTtsQueue(targetBcp47: string, nativeBcp47: string, phase: string): Promise<void> {
  if (streamTtsBusy || streamTtsStopped) return;
  streamTtsBusy = true;

  while (streamTtsBuffer.length > 0 && !streamTtsStopped) {
    const match = streamTtsBuffer.match(SENTENCE_BOUNDARY);
    if (!match) break;

    const idx = match.index! + 1;
    const sentence = streamTtsBuffer.slice(0, idx).trim();
    streamTtsBuffer = streamTtsBuffer.slice(idx).trim();

    if (!sentence) continue;

    await speakMixedText(sentence, targetBcp47, nativeBcp47, phase);
  }

  streamTtsBusy = false;
}

export function feedStreamTts(chunk: string, targetBcp47: string, nativeBcp47: string, phase: string): void {
  if (streamTtsStopped) return;
  streamTtsBuffer += chunk;
  processStreamTtsQueue(targetBcp47, nativeBcp47, phase);
}

export function stopStreamingTts(): void {
  streamTtsStopped = true;
  streamTtsBuffer = '';
  streamTtsBusy = false;
}

export function resetStreamingTts(): void {
  streamTtsStopped = false;
  streamTtsBuffer = '';
  streamTtsBusy = false;
}
