import {
  containsTargetScript,
  splitIntoLangSpans,
  detectSpeechLang as detectLang,
  type LangSpan,
} from './lang-detect';
import { resolveAzureVoice } from '../language';

function cleanTextForTTS(text: string): string {
  return text
    .replace(/【[^】]*】/g, '')
    .replace(/[？?]+\s*$/g, '?')
    .replace(/[？]+/g, '?')
    .replace(/[！]+/g, '!')
    .replace(/[。]+/g, '.')
    .replace(/[、]+/g, ',')
    .replace(/\u3000/g, ' ')
    .replace(/[「」『』]/g, '"')
    .replace(/[（()]/g, '')
    .replace(/[）]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let currentVisemeId = -1;
let isAzureSpeaking = false;
let azureStopCallback: (() => void) | null = null;

let currentGeneration = 0;

export type SpeakingCallback = (speaking: boolean) => void;
let onSpeakingChange: SpeakingCallback | null = null;

export function setOnSpeakingChange(cb: SpeakingCallback | null): void {
  onSpeakingChange = cb;
}

let currentVoiceGender: string = 'Female';

export function setVoiceGender(gender: string): void {
  currentVoiceGender = gender;
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
    const cleaned = cleanTextForTTS(text);
    if (!cleaned) { notifySpeaking(false); resolve(); return; }
    notifySpeaking(true);
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onend = () => { notifySpeaking(false); resolve(); };
    utterance.onerror = () => { notifySpeaking(false); resolve(); };
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      notifySpeaking(false);
      resolve();
    }
  });
}

export async function speakWithVisemes(
  text: string,
  lang: string = 'ja-JP',
): Promise<void> {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) return;
  stop();
  const myGeneration = ++currentGeneration;

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleaned, lang, gender: currentVoiceGender }),
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

        if (audioCtx.state === 'closed') {
          currentVisemeId = -1;
          isAzureSpeaking = false;
          notifySpeaking(false);
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
    return speak(cleaned, lang);
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

function resolveTTSVoice(bcp47: string): string {
  return resolveAzureVoice(bcp47, currentVoiceGender.toLowerCase());
}

function spanVoiceFor(lang: 'target' | 'native', targetBcp47: string, nativeBcp47: string, phase: string, text?: string): string {
  if (phase === 'unguided') {
    if (text && !containsTargetScript(text, targetBcp47)) return nativeBcp47;
    return targetBcp47;
  }
  return lang === 'target' ? targetBcp47 : nativeBcp47;
}

function buildSSML(spans: { text: string; voice: string }[]): string {
  const parts: string[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const escaped = span.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    parts.push(`<voice name="${resolveTTSVoice(span.voice)}">${escaped}</voice>`);
  }
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${parts.join('')}</speak>`;
}

async function speakAzureSSML(ssml: string): Promise<void> {
  stop();
  const myGeneration = ++currentGeneration;

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssml }),
    });

    if (!response.ok) throw new Error(`Azure TTS SSML returned ${response.status}`);

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

    return new Promise<void>((resolve) => {
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

        if (audioCtx.state === 'closed') {
          currentVisemeId = -1;
          isAzureSpeaking = false;
          notifySpeaking(false);
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
    throw new Error('SSML Azure TTS failed');
  }
}

/**
 * Speak a text that may contain mixed ⟦target (romaji)⟧ and native-language spans.
 * Uses SSML for seamless voice switching in a single Azure call.
 */
export async function speakMixedText(
  raw: string,
  targetBcp47: string,
  nativeBcp47: string,
  phase: string = 'guided',
): Promise<void> {
  // Same language — no span splitting or SSML needed, use single voice
  if (targetBcp47 === nativeBcp47) {
    const cleaned = cleanTextForTTS(raw);
    if (!cleaned) return;
    try {
      await speakWithVisemes(cleaned, targetBcp47);
    } catch {
      await speak(cleaned, targetBcp47);
    }
    return;
  }

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

  const ssmlSpans = spans.map(span => ({
    text: span.text,
    voice: spanVoiceFor(span.lang, targetBcp47, nativeBcp47, phase, span.text),
  }));

  try {
    const ssml = buildSSML(ssmlSpans);
    await speakAzureSSML(ssml);
  } catch {
    for (const span of spans) {
      const voiceLang = spanVoiceFor(span.lang, targetBcp47, nativeBcp47, phase, span.text);
      try {
        await speakWithVisemes(span.text, voiceLang);
      } catch {
        await speak(span.text, voiceLang);
      }
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
