import {
  containsTargetScript,
  splitIntoLangSpans,
  detectSpeechLang as detectLang,
} from './lang-detect';
import { resolveAzureVoice } from '../language';
import { getToken } from './pronunciation';

/* ── Overview ───────────────────────────────────────────────────────────
   Speech output for the roleplay session.

   The AI's reply is spoken sentence-by-sentence AS THE MODEL STREAMS IT
   (see feedStreamTts), synthesized by an Azure synthesizer running in the
   browser whose audio plays while it is still arriving. Two things used to
   sit between the learner and the first syllable of a reply, and both are
   gone:

   1. Callers only started speaking in the stream's `text_done` event, i.e.
      after the ENTIRE model response had finished generating. The streaming
      queue below existed but nothing ever called it.
   2. Each sentence then made a blocking POST to /api/tts, waited for Azure
      to synthesize the whole clip server-side, base64'd it, shipped it back,
      and decoded it before a single sample was played.

   The server route stays as a fallback for browsers or networks where the
   direct SDK path can't establish itself.
   ────────────────────────────────────────────────────────────────────── */

type SpeechSDK = typeof import('microsoft-cognitiveservices-speech-sdk');
// Type-only import: erased at compile time, so the SDK is still pulled in
// lazily by the dynamic import in loadSdk() rather than in the page bundle.
type AzureSpeechConfig = import('microsoft-cognitiveservices-speech-sdk').SpeechConfig;

function cleanTextForTTS(text: string): string {
  return text
    .replace(/【[^】]*】/g, '')
    .replace(/[？?]+\s*$/g, '?')
    .replace(/[？]+/g, '?')
    .replace(/[！]+/g, '!')
    .replace(/[。]+/g, '.')
    .replace(/[、]+/g, ',')
    .replace(/　/g, ' ')
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
let sharedAudioCtx: AudioContext | null = null;
let ttsAnalyser: AnalyserNode | null = null;

export function getTtsAnalyser(): AnalyserNode | null {
  return ttsAnalyser;
}

export type SpeakingCallback = (speaking: boolean) => void;
let onSpeakingChange: SpeakingCallback | null = null;

export function setOnSpeakingChange(cb: SpeakingCallback | null): void {
  onSpeakingChange = cb;
}

let currentVoiceGender: string = 'Female';

export function setVoiceGender(gender: string): void {
  currentVoiceGender = gender?.trim() ? gender : 'Female';
}

/* ── Speaking state ─────────────────────────────────────────────────────
   A reply is now spoken as a run of per-sentence utterances rather than one
   long clip, so "is the character talking?" can no longer be answered by a
   single utterance's lifetime — that would drop to false at every sentence
   boundary and make the avatar flicker between its talk and idle animations
   several times per reply.

   Instead: speaking goes true when the first utterance starts, and only goes
   false once nothing has been speaking for a short grace period, which
   comfortably covers the gap while the next sentence is synthesized.
   ────────────────────────────────────────────────────────────────────── */

const SPEAKING_SETTLE_MS = 350;

let activeUtterances = 0;
let speakingSettleTimer: ReturnType<typeof setTimeout> | null = null;
let reportedSpeaking = false;

function emitSpeaking(speaking: boolean): void {
  if (reportedSpeaking === speaking) return;
  reportedSpeaking = speaking;
  isAzureSpeaking = speaking;
  if (onSpeakingChange) onSpeakingChange(speaking);
}

function beginUtterance(): void {
  activeUtterances++;
  if (speakingSettleTimer) {
    clearTimeout(speakingSettleTimer);
    speakingSettleTimer = null;
  }
  emitSpeaking(true);
}

function endUtterance(): void {
  activeUtterances = Math.max(0, activeUtterances - 1);
  if (activeUtterances > 0 || speakingSettleTimer) return;

  speakingSettleTimer = setTimeout(() => {
    speakingSettleTimer = null;
    if (activeUtterances === 0) {
      currentVisemeId = -1;
      emitSpeaking(false);
    }
  }, SPEAKING_SETTLE_MS);
}

/** Immediate, unconditional reset — used by stop()/barge-in. */
function resetSpeakingState(): void {
  activeUtterances = 0;
  if (speakingSettleTimer) {
    clearTimeout(speakingSettleTimer);
    speakingSettleTimer = null;
  }
  currentVisemeId = -1;
  emitSpeaking(false);
}

function notifySpeaking(speaking: boolean): void {
  if (speaking) beginUtterance();
  else endUtterance();
}

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContext();
    try {
      const analyser = sharedAudioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      analyser.connect(sharedAudioCtx.destination);
      ttsAnalyser = analyser;
    } catch {
      ttsAnalyser = null;
    }
  }
  return sharedAudioCtx;
}

function connectToOutput(source: AudioNode, audioCtx: AudioContext): void {
  if (ttsAnalyser) {
    source.connect(ttsAnalyser);
  } else {
    source.connect(audioCtx.destination);
  }
}

export function getCurrentViseme(): number {
  return currentVisemeId;
}

export function isSpeaking(): boolean {
  return isAzureSpeaking || window.speechSynthesis.speaking;
}

/* ── Browser-side Azure synthesizer ─────────────────────────────────────
   The SpeechConfig (and the auth token inside it) is cached and shared
   across utterances so only the first one pays for setup. A fresh
   SpeakerAudioDestination + SpeechSynthesizer is built per utterance: a
   SpeakerAudioDestination is single-use by design, and building it from an
   already-warm config is cheap.
   ────────────────────────────────────────────────────────────────────── */

let sdkPromise: Promise<SpeechSDK> | null = null;

function loadSdk(): Promise<SpeechSDK> {
  if (!sdkPromise) {
    sdkPromise = import('microsoft-cognitiveservices-speech-sdk');
  }
  return sdkPromise;
}

// Azure authorization tokens last 10 minutes; rebuild the config a little
// early so a long session never tries to synthesize with a stale one.
const CONFIG_TTL_MS = 8 * 60 * 1000;
let cachedConfig: { config: AzureSpeechConfig; expiresAt: number } | null = null;
let configPromise: Promise<AzureSpeechConfig> | null = null;

async function getSpeechConfig(): Promise<AzureSpeechConfig> {
  if (cachedConfig && cachedConfig.expiresAt > Date.now()) return cachedConfig.config;

  if (!configPromise) {
    configPromise = (async () => {
      const sdk = await loadSdk();
      const { token, region } = await getToken();
      const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
      // Matches the server route's format so both paths sound identical.
      config.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;
      cachedConfig = { config, expiresAt: Date.now() + CONFIG_TTL_MS };
      return config;
    })().finally(() => { configPromise = null; });
  }

  return configPromise;
}

/**
 * Warms the SDK module and the speech config so the first reply of a session
 * doesn't pay for them. Safe to call repeatedly; failures are ignored because
 * the next real synthesis retries and can still fall back to the server route.
 */
export function prewarmTts(): void {
  getSpeechConfig().catch(() => {});
}

/**
 * Synthesizes SSML through the browser SDK, playing it as it arrives and
 * emitting visemes in real time. Resolves when playback finishes.
 *
 * Throws if the direct path can't be used at all, so callers can fall back.
 */
async function speakSsmlDirect(ssml: string, generation: number): Promise<void> {
  const sdk = await loadSdk();
  const speechConfig = await getSpeechConfig();

  if (generation !== currentGeneration) return;

  const player = new sdk.SpeakerAudioDestination();
  const audioConfig = sdk.AudioConfig.fromSpeakerOutput(player);
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  // Real-time visemes straight from the service. This replaces the old
  // requestAnimationFrame walk over a pre-baked timeline — the events now
  // arrive already aligned with the audio that is playing.
  synthesizer.visemeReceived = (_s, e) => {
    if (generation !== currentGeneration) return;
    currentVisemeId = e.visemeId;
  };

  currentVisemeId = -1;
  notifySpeaking(true);

  let settled = false;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;

  return new Promise<void>((resolve, reject) => {
    // Shared teardown. `settled` makes every completion path idempotent —
    // onAudioEnd, the synthesis callback, an error, and a barge-in can all
    // race, and only the first may take effect.
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
      if (azureStopCallback === stopThis) azureStopCallback = null;
      try { synthesizer.close(); } catch { /* already closed */ }
      // Always balance the beginUtterance() above, even for a superseded
      // generation — an unbalanced count would leave the avatar stuck in its
      // talking animation for the rest of the session.
      notifySpeaking(false);
      outcome();
    };

    const finish = () => settle(resolve);

    const stopThis = () => {
      // Barge-in: kill playback immediately rather than letting the buffered
      // tail keep talking over the learner.
      try { player.pause(); } catch { /* ignore */ }
      try { player.close(); } catch { /* ignore */ }
      settle(resolve);
    };
    azureStopCallback = stopThis;

    // Fires once the last buffered sample has actually been played, which is
    // later than the synthesis callback below — this is the real end of speech.
    player.onAudioEnd = finish;

    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        if (result.reason === sdk.ResultReason.Canceled) {
          settle(() => reject(new Error(
            `Azure synthesis canceled: ${result.errorDetails ?? 'unknown'}`,
          )));
          return;
        }
        // Synthesis finished, but audio may still be draining through the
        // speaker. onAudioEnd is what normally resolves us; this only covers
        // a player that never reports back.
        drainTimer = setTimeout(finish, 15000);
      },
      (error) => settle(() => reject(new Error(String(error)))),
    );
  });
}

/* ── Fallbacks ──────────────────────────────────────────────────────────
   Server-synthesized audio (/api/tts), then the browser's own voice. Both
   keep working exactly as before for anything the direct path can't do.
   ────────────────────────────────────────────────────────────────────── */

export function speak(text: string, lang: string = 'ja-JP'): Promise<void> {
  return new Promise((resolve) => {
    const cleaned = cleanTextForTTS(text);
    // Nothing to say: return without touching the speaking count, which has
    // no matching increment to balance here.
    if (!cleaned) { resolve(); return; }
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

/**
 * Server-synthesized playback: fetches a complete clip from /api/tts and
 * walks its viseme timeline against the audio clock. Slower to first sound
 * than the direct path, so it is only used as a fallback.
 */
async function speakViaServer(
  body: Record<string, unknown>,
  generation: number,
): Promise<void> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Azure TTS returned ${response.status}`);

  const { audio: audioBase64, visemes } = await response.json();
  if (generation !== currentGeneration) return;

  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const audioCtx = getAudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);

  if (generation !== currentGeneration) return;

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  connectToOutput(source, audioCtx);
  source.start(0);

  currentVisemeId = -1;
  notifySpeaking(true);

  const startTime = audioCtx.currentTime;
  let visemeIndex = 0;
  const cancelled = { value: false };

  azureStopCallback = () => {
    cancelled.value = true;
    try { source.stop(); } catch { /* ignore */ }
  };

  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      // Balance the beginUtterance() above unconditionally — see the note in
      // speakSsmlDirect's settle().
      notifySpeaking(false);
      resolve();
    };

    const tick = () => {
      if (cancelled.value || generation !== currentGeneration || audioCtx.state === 'closed') {
        settle();
        return;
      }

      const elapsed = (audioCtx.currentTime - startTime) * 1000;
      while (visemeIndex < visemes.length && visemes[visemeIndex].offsetMs <= elapsed) {
        currentVisemeId = visemes[visemeIndex].id;
        visemeIndex++;
      }

      if (visemeIndex >= visemes.length) { settle(); return; }
      requestAnimationFrame(tick);
    };

    tick();
    source.onended = () => { if (!cancelled.value) settle(); };
  });
}

export function stop(): void {
  currentGeneration++;
  stopStreamingTts();
  if (azureStopCallback) {
    azureStopCallback();
    azureStopCallback = null;
  }
  window.speechSynthesis.cancel();
  // Barge-in must silence the character immediately — no settle grace period.
  resetSpeakingState();
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

function escapeSSML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSSML(spans: { text: string; voice: string }[]): string {
  const parts: string[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    parts.push(`<voice name="${resolveTTSVoice(span.voice)}">${escapeSSML(span.text)}</voice>`);
  }
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${parts.join('')}</speak>`;
}

/**
 * Speaks one already-built SSML document, degrading in order:
 * browser-direct streaming → server-synthesized clip → the browser's own
 * voice. Each step is only tried if the previous one failed AND this
 * utterance is still the current one (a barge-in bumps the generation and
 * makes every remaining step a no-op).
 */
async function speakSsmlWithFallback(
  ssml: string,
  plainText: string,
  fallbackLang: string,
): Promise<void> {
  const generation = ++currentGeneration;

  try {
    await speakSsmlDirect(ssml, generation);
    return;
  } catch (err) {
    if (generation !== currentGeneration) return;
    console.warn('[TTS] direct synthesis failed, falling back to /api/tts:', err);
  }

  try {
    await speakViaServer({ ssml }, generation);
    return;
  } catch (err) {
    if (generation !== currentGeneration) return;
    console.warn('[TTS] server synthesis failed, falling back to browser voice:', err);
  }

  if (generation !== currentGeneration) return;
  await speak(plainText, fallbackLang);
}

/**
 * Speaks text in a single language and voice, with visemes for lip-sync.
 * Used by the standalone vocabulary/exchange drills, which have no
 * native/target span structure to preserve.
 */
export async function speakWithVisemes(text: string, lang: string = 'ja-JP'): Promise<void> {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) return;

  const ssml = buildSSML([{ text: cleaned, voice: lang }]);
  await speakSsmlWithFallback(ssml, cleaned, lang);
}

/**
 * Speaks text that may mix ⟦target⟧ and native-language spans, switching
 * voices mid-utterance via SSML in a single synthesis so the two languages
 * flow as one line rather than two clips.
 */
export async function speakMixedText(
  raw: string,
  targetBcp47: string,
  nativeBcp47: string,
  phase: string = 'guided',
): Promise<void> {
  const cleaned = cleanTextForTTS(raw);
  if (!cleaned) return;

  // Same language on both sides: one voice, no span splitting needed.
  const spans = targetBcp47 === nativeBcp47 ? [] : splitIntoLangSpans(raw);

  const ssmlSpans = spans.length > 0
    ? spans.map(span => ({
        text: cleanTextForTTS(span.text),
        voice: spanVoiceFor(span.lang, targetBcp47, nativeBcp47, phase, span.text),
      })).filter(s => s.text)
    : [{
        text: cleaned,
        voice: targetBcp47 === nativeBcp47
          ? targetBcp47
          : detectLang(raw, targetBcp47, nativeBcp47),
      }];

  if (ssmlSpans.length === 0) return;

  await speakSsmlWithFallback(
    buildSSML(ssmlSpans),
    ssmlSpans.map(s => s.text).join(' '),
    ssmlSpans[0]?.voice ?? targetBcp47,
  );
}

/* ── Streaming TTS ──────────────────────────────────────────────────────
   Fed from the model's token stream so the character starts talking on the
   first complete sentence instead of after the whole reply.
   ────────────────────────────────────────────────────────────────────── */

let streamTtsBuffer = '';
let streamTtsBusy = false;
let streamTtsStopped = false;

// A sentence terminator only ends a sentence if it is followed by whitespace,
// a closing delimiter, or end-of-buffer. Without that guard a decimal, an
// abbreviation, or a mid-word period would be spoken as a complete sentence.
const SENTENCE_BOUNDARY = /[。！？](?=\s|⟧|$)|[.!?](?=\s|⟧|$)|\n/;

// Don't synthesize a fragment so short it costs more in setup than it returns;
// wait for it to join the next sentence instead.
const MIN_SENTENCE_CHARS = 2;

async function processStreamTtsQueue(targetBcp47: string, nativeBcp47: string, phase: string): Promise<void> {
  if (streamTtsBusy || streamTtsStopped) return;
  streamTtsBusy = true;

  try {
    while (!streamTtsStopped) {
      const match = streamTtsBuffer.match(SENTENCE_BOUNDARY);
      if (!match) break;

      const idx = match.index! + match[0].length;
      const sentence = streamTtsBuffer.slice(0, idx).trim();
      streamTtsBuffer = streamTtsBuffer.slice(idx).trimStart();

      if (sentence.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_SENTENCE_CHARS) continue;

      await speakMixedText(sentence, targetBcp47, nativeBcp47, phase);
    }
  } finally {
    streamTtsBusy = false;
  }
}

/**
 * Feeds a chunk of the model's streaming reply to the speaker. Call this from
 * the stream's token handler; each completed sentence is spoken as soon as it
 * is available, while the model is still generating the rest.
 */
export function feedStreamTts(chunk: string, targetBcp47: string, nativeBcp47: string, phase: string): void {
  if (streamTtsStopped || !chunk) return;
  streamTtsBuffer += chunk;
  void processStreamTtsQueue(targetBcp47, nativeBcp47, phase);
}

/**
 * Speaks whatever is left in the buffer once the model has finished — the
 * final sentence often arrives without trailing punctuation. Resolves when
 * the queue has fully drained, so callers can await the end of speech.
 */
export async function flushStreamTts(targetBcp47: string, nativeBcp47: string, phase: string): Promise<void> {
  if (streamTtsStopped) return;

  // Let any in-flight queue run to completion first.
  while (streamTtsBusy && !streamTtsStopped) {
    await new Promise((r) => setTimeout(r, 30));
  }
  if (streamTtsStopped) return;

  const tail = streamTtsBuffer.trim();
  streamTtsBuffer = '';
  if (tail && tail.replace(/[^\p{L}\p{N}]/gu, '').length >= MIN_SENTENCE_CHARS) {
    await speakMixedText(tail, targetBcp47, nativeBcp47, phase);
  }
}

export function unlockAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* ignore */ }
  // Pull the SDK and token in on the same user gesture that unlocks audio,
  // so the first reply doesn't pay for either.
  prewarmTts();
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
