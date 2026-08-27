import {
  containsTargetScript,
  hasDetectableScript,
  splitIntoLangSpans,
  detectSpeechLang as detectLang,
} from './lang-detect';
import { resolveAzureVoice } from '../language';
import { getToken } from './pronunciation';
import { markFirstAudio } from './voice-latency';
import { findSentenceEnd } from './sentence-split';

/* ── Overview ───────────────────────────────────────────────────────────
   Speech output for the roleplay session.

   The AI's reply is spoken sentence-by-sentence AS THE MODEL STREAMS IT
   (see feedStreamTts), synthesized by an Azure synthesizer running in the
   browser whose audio plays while it is still arriving. Three things used to
   sit between the learner and a naturally-paced reply, and all are gone:

   1. Callers only started speaking in the stream's `text_done` event, i.e.
      after the ENTIRE model response had finished generating. The streaming
      queue below existed but nothing ever called it.
   2. Each sentence then made a blocking POST to /api/tts, waited for Azure
      to synthesize the whole clip server-side, base64'd it, shipped it back,
      and decoded it before a single sample was played.
   3. Sentences were then synthesized STRICTLY ONE AT A TIME: the queue
      awaited the end of sentence N's playback before it even opened the
      connection for sentence N+1, so every sentence boundary in a reply
      carried a fresh connect-and-synthesize round trip as dead air. A
      four-sentence reply spent seconds of its length silent. Synthesis and
      playback are now split (prepareSsmlDirect / PreparedUtterance) so the
      next sentences buffer while the current one is being spoken.

   Lip-sync is driven off the PLAYBACK clock, not off event arrival: viseme
   events stream in as fast as the service can synthesize, which is far ahead
   of the audio, so applying them on arrival desynchronized the mouth from the
   voice.

   The server route stays as a fallback for browsers or networks where the
   direct SDK path can't establish itself.
   ────────────────────────────────────────────────────────────────────── */

type SpeechSDK = typeof import('microsoft-cognitiveservices-speech-sdk');
// Type-only import: erased at compile time, so the SDK is still pulled in
// lazily by the dynamic import in loadSdk() rather than in the page bundle.
type AzureSpeechConfig = import('microsoft-cognitiveservices-speech-sdk').SpeechConfig;

function cleanTextForTTS(text: string): string {
  return text
    // Markdown emphasis/headers: strip the markup but keep the wrapped text.
    // The final [*_~`#] sweep also catches anything left unpaired, so a lone
    // "**" or stray "_" is never read aloud literally.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`#]/g, '')
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

// How many utterances are currently audible THROUGH the shared Web Audio
// graph. The browser's own speechSynthesis voice never routes through it, and
// an analyser reading that silence would tell the lip-sync the character's
// mouth should be shut for the whole line — so hand out nothing unless the
// audio really is passing through the analyser.
let analyserRouteCount = 0;

function holdAnalyser(): void { analyserRouteCount++; }
function releaseAnalyser(): void { analyserRouteCount = Math.max(0, analyserRouteCount - 1); }

export function getTtsAnalyser(): AnalyserNode | null {
  return analyserRouteCount > 0 ? ttsAnalyser : null;
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
  // The first utterance of a reply going audible is the far end of the
  // mic-release → first-audio measurement. Later sentences of the same reply
  // don't re-report: the count only crosses zero once per reply.
  if (speaking) markFirstAudio();
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

/**
 * The session's single playback AudioContext.
 *
 * Exported so other UI sound (lib/roleplay/mic-sfx.ts) shares this graph and
 * this unlock (`unlockAudio`) instead of standing up a second output context.
 * Callers that are not the character's voice must connect straight to
 * `destination` — the analyser in front of it drives the lip-sync, and feeding
 * it anything else would move the avatar's mouth to a UI sound.
 */
export function getPlaybackContext(): AudioContext {
  return getAudioContext();
}

function connectToOutput(source: AudioNode, audioCtx: AudioContext): void {
  if (ttsAnalyser) {
    source.connect(ttsAnalyser);
  } else {
    source.connect(audioCtx.destination);
  }
}

/**
 * Routes a SpeakerAudioDestination's audio element through the shared graph so
 * the lip-sync can read its real amplitude. Without this the SDK plays the
 * element straight to the speaker, the analyser stays silent, and the mouth
 * falls back to a synthetic pattern that has nothing to do with the voice.
 *
 * Returns false (leaving the element playing directly) whenever routing would
 * be unsafe — a suspended context would silence the utterance outright.
 */
const routedAudioElements = new WeakSet<HTMLAudioElement>();

function attachToAnalyser(element: HTMLAudioElement | undefined): boolean {
  try {
    if (!element || routedAudioElements.has(element)) return false;
    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    if (audioCtx.state !== 'running') return false;
    const source = audioCtx.createMediaElementSource(element);
    routedAudioElements.add(element);
    connectToOutput(source, audioCtx);
    return true;
  } catch {
    return false;
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

/* ── Prepared utterances ────────────────────────────────────────────────
   Synthesis and playback are deliberately split. Preparing an utterance
   opens its connection and starts the service synthesizing immediately;
   playing it is a separate, later act. That split is what lets sentence N+1
   be synthesized WHILE sentence N is still being spoken, instead of the
   learner sitting through a fresh connect-and-synthesize round trip in the
   silence after every sentence.
   ────────────────────────────────────────────────────────────────────── */

type VisemeFrame = { id: number; offsetMs: number };

// Watchdog cadence for an utterance whose player never fires onAudioEnd.
const DRAIN_TICK_MS = 500;
/** Playback clock frozen this many ticks (3s) after synthesis finished. */
const STALLED_TICKS = 6;
/** Playback clock never left zero this many ticks (20s) after synthesis finished. */
const NEVER_STARTED_TICKS = 40;

interface PreparedUtterance {
  /** Starts playback of audio that is already being synthesized. Resolves at end of audio. */
  play(): Promise<void>;
  /** Discards the utterance without ever playing it. */
  cancel(): void;
}

/**
 * Starts synthesizing SSML through the browser SDK with playback held back,
 * and returns a handle that plays it on demand.
 *
 * Rejects (at prepare or at play) if the direct path can't be used, so callers
 * can fall back.
 */
async function prepareSsmlDirect(ssml: string, generation: number): Promise<PreparedUtterance> {
  const sdk = await loadSdk();
  const speechConfig = await getSpeechConfig();

  const player = new sdk.SpeakerAudioDestination();
  const audioConfig = sdk.AudioConfig.fromSpeakerOutput(player);
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  // Visemes are collected, not applied. They arrive from the service as fast
  // as it can synthesize — far ahead of the audio the speaker is playing — so
  // applying each one on arrival ran the mouth ahead of the voice and left it
  // still while the tail of the sentence was still being spoken. audioOffset
  // is in 100ns ticks from the start of THIS utterance's audio, which is
  // exactly what player.currentTime measures.
  const visemes: VisemeFrame[] = [];
  synthesizer.visemeReceived = (_s, e) => {
    visemes.push({ id: e.visemeId, offsetMs: e.audioOffset / 10_000 });
  };

  let wantPlay = false;
  let audioStarted = false;
  let routed = false;
  let closed = false;
  let onAudioEnded: (() => void) | null = null;
  let onSynthSettled: (() => void) | null = null;
  let synthSettled = false;
  let synthError: Error | null = null;

  const closeAll = () => {
    if (closed) return;
    closed = true;
    try { synthesizer.close(); } catch { /* already closed */ }
    if (routed) { routed = false; releaseAnalyser(); }
  };

  // onAudioStart runs immediately before the SDK would call play() on its
  // audio element, and pausing from inside it is the only hook that keeps a
  // pre-synthesized utterance silent until its turn comes up. Buffering
  // continues either way — that is the whole point.
  player.onAudioStart = () => {
    // closeAll() does not stop a pending notifyPlayback() from firing this —
    // a late callback must not re-attach the analyser after its route was
    // released (or resurrect audioStarted for an utterance that never plays).
    if (closed) return;
    audioStarted = true;
    if (!wantPlay) {
      try { player.pause(); } catch { /* ignore */ }
    }
    if (attachToAnalyser(player.internalAudio)) {
      routed = true;
      holdAnalyser();
    }
  };
  player.onAudioEnd = () => { onAudioEnded?.(); };

  const settleSynth = (err: Error | null) => {
    synthSettled = true;
    synthError = err;
    onSynthSettled?.();
  };

  synthesizer.speakSsmlAsync(
    ssml,
    (result) => settleSynth(
      result.reason === sdk.ResultReason.Canceled
        ? new Error(`Azure synthesis canceled: ${result.errorDetails ?? 'unknown'}`)
        : null,
    ),
    (error) => settleSynth(new Error(String(error))),
  );

  const cancel = () => {
    wantPlay = false;
    try { player.pause(); } catch { /* ignore */ }
    try { player.close(); } catch { /* ignore */ }
    closeAll();
  };

  const play = (): Promise<void> => new Promise<void>((resolve, reject) => {
    if (generation !== currentGeneration) { cancel(); resolve(); return; }
    // Synthesis already failed and nothing ever reached the speaker: report it
    // now so the caller falls back before the learner hears the gap.
    if (synthSettled && synthError && !audioStarted) { cancel(); reject(synthError); return; }

    let settled = false;
    let drainTimer: ReturnType<typeof setInterval> | null = null;

    // Shared teardown. `settled` makes every completion path idempotent —
    // onAudioEnd, the synthesis callback, an error, and a barge-in can all
    // race, and only the first may take effect.
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      if (drainTimer) { clearInterval(drainTimer); drainTimer = null; }
      if (azureStopCallback === stopThis) azureStopCallback = null;
      onAudioEnded = null;
      onSynthSettled = null;
      closeAll();
      // Always balance the beginUtterance() below, even for a superseded
      // generation — an unbalanced count would leave the avatar stuck in its
      // talking animation for the rest of the session.
      notifySpeaking(false);
      outcome();
    };

    const stopThis = () => {
      // Barge-in: kill playback immediately rather than letting the buffered
      // tail keep talking over the learner.
      try { player.pause(); } catch { /* ignore */ }
      try { player.close(); } catch { /* ignore */ }
      settle(resolve);
    };
    azureStopCallback = stopThis;

    // Fires once the last buffered sample has actually been played, which is
    // later than the synthesis callback — this is the real end of speech.
    onAudioEnded = () => settle(resolve);

    onSynthSettled = () => {
      if (synthError && !audioStarted) { settle(() => reject(synthError!)); return; }
      // Synthesis finished, but audio may still be draining through the
      // speaker. onAudioEnd is what normally resolves us; this only covers a
      // player that never reports back. It watches for the playback clock to
      // STOP ADVANCING rather than counting down a fixed timeout, so a long
      // utterance is never cut off while it is still being spoken.
      let lastTime = -1;
      let stalledTicks = 0;
      let silentTicks = 0;
      drainTimer = setInterval(() => {
        const now = player.currentTime;
        if (now > lastTime) { lastTime = now; stalledTicks = 0; return; }
        // Still queued behind the speaker's own buffering: the clock hasn't
        // started yet, so there is nothing to call stalled.
        if (now <= 0) {
          if (++silentTicks >= NEVER_STARTED_TICKS) settle(resolve);
          return;
        }
        if (++stalledTicks >= STALLED_TICKS) settle(resolve);
      }, DRAIN_TICK_MS);
    };
    if (synthSettled) onSynthSettled();

    currentVisemeId = -1;
    notifySpeaking(true);
    wantPlay = true;
    // No-op if onAudioStart hasn't run yet; that handler then sees wantPlay
    // and lets the SDK start playback itself.
    try { player.resume(); } catch { /* ignore */ }

    // Walk the collected timeline against the PLAYBACK clock, so each mouth
    // shape lands on the syllable it belongs to.
    let visemeIndex = 0;
    const tick = () => {
      if (settled || generation !== currentGeneration) return;
      const elapsedMs = player.currentTime * 1000;
      while (visemeIndex < visemes.length && visemes[visemeIndex].offsetMs <= elapsedMs) {
        currentVisemeId = visemes[visemeIndex].id;
        visemeIndex++;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return { play, cancel };
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
  holdAnalyser();

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
      releaseAnalyser();
      // Balance the beginUtterance() above unconditionally — see the note in
      // prepareSsmlDirect's settle().
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
  cancelQueuedUtterances();
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
  // Unguided is full immersion: everything the character says is target
  // language, so a span is only read in the native voice when it demonstrably
  // isn't target text. That test is script-based, and script detection only
  // works for the CJK targets — for French, Spanish, Swahili and every other
  // Latin-script target it answered "not target" for target-language text and
  // read the entire immersion phase aloud in the learner's native voice.
  // Where the script can't decide, the ⟦ ⟧ markers do, exactly as in every
  // other phase.
  if (phase === 'unguided' && hasDetectableScript(targetBcp47)) {
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

/* ── Playback queue ─────────────────────────────────────────────────────
   Utterances play strictly in order, but they are SYNTHESIZED concurrently:
   as soon as an utterance is queued, the next couple of entries behind the
   one that is speaking start their synthesis in the background. By the time
   the current sentence ends, the next one is already buffered and starts
   immediately instead of after a fresh Azure connect + synthesis round trip.

   The old code awaited a whole sentence — connect, synthesize, play, tear
   down — before it even looked at the next one, which is what put a dead gap
   of several hundred milliseconds into every sentence boundary of a reply.
   ────────────────────────────────────────────────────────────────────── */

interface QueuedUtterance {
  generation: number;
  ssml: string;
  plainText: string;
  fallbackLang: string;
  prepared: Promise<PreparedUtterance> | null;
}

// One utterance is audible while the next ones buffer. Two ahead covers the
// gap comfortably without holding a fistful of open Azure connections.
const PREPARE_AHEAD = 2;

const utteranceQueue: QueuedUtterance[] = [];
let queuePump: Promise<void> | null = null;

function prepareAhead(): void {
  for (let i = 0; i < Math.min(PREPARE_AHEAD, utteranceQueue.length); i++) {
    const item = utteranceQueue[i];
    if (item.prepared) continue;
    item.prepared = prepareSsmlDirect(item.ssml, item.generation);
    // Failures are surfaced when the utterance's turn to play comes up, where
    // the fallback chain lives; swallow them here so they aren't unhandled.
    item.prepared.catch(() => {});
  }
}

function cancelQueuedUtterances(): void {
  const dropped = utteranceQueue.splice(0);
  for (const item of dropped) {
    item.prepared?.then((p) => p.cancel()).catch(() => {});
  }
}

/**
 * Plays one queued utterance, degrading in order: browser-direct streaming →
 * server-synthesized clip → the browser's own voice. Each step is only tried
 * if the previous one failed AND this utterance is still current (a barge-in
 * bumps the generation and makes every remaining step a no-op).
 */
async function playQueuedUtterance(item: QueuedUtterance): Promise<void> {
  try {
    const prepared = await (item.prepared ?? prepareSsmlDirect(item.ssml, item.generation));
    await prepared.play();
    return;
  } catch (err) {
    if (item.generation !== currentGeneration) return;
    console.warn('[TTS] direct synthesis failed, falling back to /api/tts:', err);
  }

  try {
    await speakViaServer({ ssml: item.ssml }, item.generation);
    return;
  } catch (err) {
    if (item.generation !== currentGeneration) return;
    console.warn('[TTS] server synthesis failed, falling back to browser voice:', err);
  }

  if (item.generation !== currentGeneration) return;
  await speak(item.plainText, item.fallbackLang);
}

function runQueue(): Promise<void> {
  if (!queuePump) {
    queuePump = (async () => {
      try {
        for (;;) {
          const item = utteranceQueue.shift();
          if (!item) break;
          if (item.generation !== currentGeneration) {
            item.prepared?.then((p) => p.cancel()).catch(() => {});
            continue;
          }
          prepareAhead();
          await playQueuedUtterance(item);
        }
      } finally {
        queuePump = null;
      }
    })();
  }
  return queuePump;
}

/** Resolves once the queue has fully drained, including anything added while waiting. */
async function drainQueue(): Promise<void> {
  while (queuePump) await queuePump;
}

/**
 * Adds one already-built SSML document to the end of the speech queue and
 * starts synthesizing it right away. Resolves when the queue has drained.
 */
function enqueueSsml(ssml: string, plainText: string, fallbackLang: string): Promise<void> {
  utteranceQueue.push({
    generation: currentGeneration,
    ssml,
    plainText,
    fallbackLang,
    prepared: null,
  });
  prepareAhead();
  return runQueue();
}

/** Builds the SSML for a line that may mix ⟦target⟧ and native-language spans. */
function buildMixedSsml(
  raw: string,
  targetBcp47: string,
  nativeBcp47: string,
  phase: string,
): { ssml: string; plainText: string; fallbackLang: string } | null {
  const cleaned = cleanTextForTTS(raw);
  if (!cleaned) return null;

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

  if (ssmlSpans.length === 0) return null;

  return {
    ssml: buildSSML(ssmlSpans),
    plainText: ssmlSpans.map(s => s.text).join(' '),
    fallbackLang: ssmlSpans[0]?.voice ?? targetBcp47,
  };
}

/**
 * Speaks text in a single language and voice, with visemes for lip-sync.
 * Used by the standalone vocabulary/exchange drills, which have no
 * native/target span structure to preserve.
 *
 * Interrupts whatever is currently being spoken — these are one-shot,
 * user-initiated lines, not part of a reply being narrated.
 */
export async function speakWithVisemes(text: string, lang: string = 'ja-JP'): Promise<void> {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) return;

  stop();
  resetStreamingTts();
  await enqueueSsml(buildSSML([{ text: cleaned, voice: lang }]), cleaned, lang);
}

/**
 * Speaks text that may mix ⟦target⟧ and native-language spans, switching
 * voices mid-utterance via SSML in a single synthesis so the two languages
 * flow as one line rather than two clips. Interrupts current speech.
 */
export async function speakMixedText(
  raw: string,
  targetBcp47: string,
  nativeBcp47: string,
  phase: string = 'guided',
): Promise<void> {
  const built = buildMixedSsml(raw, targetBcp47, nativeBcp47, phase);
  if (!built) return;

  stop();
  resetStreamingTts();
  await enqueueSsml(built.ssml, built.plainText, built.fallbackLang);
}

/* ── Streaming TTS ──────────────────────────────────────────────────────
   Fed from the model's token stream so the character starts talking on the
   first complete sentence instead of after the whole reply.
   ────────────────────────────────────────────────────────────────────── */

let streamTtsBuffer = '';
let streamTtsStopped = false;

// Don't synthesize a fragment so short it costs more in setup than it returns;
// wait for it to join the next sentence instead.
const MIN_SENTENCE_CHARS = 2;

// When the model has already produced several sentences by the time we look at
// the buffer, speak them as ONE utterance rather than a string of separate
// clips. Azure carries prosody across a whole utterance, so a paragraph spoken
// in one go sounds like continuous speech instead of a list of read-out lines.
// Capped so a long burst still starts playing promptly.
const MAX_GROUPED_CHARS = 240;

function hasSpeakableContent(text: string): boolean {
  return text.replace(/[^\p{L}\p{N}]/gu, '').length >= MIN_SENTENCE_CHARS;
}

function enqueueMixedText(
  raw: string,
  targetBcp47: string,
  nativeBcp47: string,
  phase: string,
): void {
  const built = buildMixedSsml(raw, targetBcp47, nativeBcp47, phase);
  if (!built) return;
  // The returned drain promise is awaited by flushStreamTts, not here — this
  // must not block the token handler that is feeding the stream.
  void enqueueSsml(built.ssml, built.plainText, built.fallbackLang).catch(() => {});
}

/**
 * Pulls every complete sentence currently sitting in the buffer and queues it
 * for speech. Synchronous by design: queueing starts synthesis without waiting
 * for playback, so the token handler returns immediately and sentences keep
 * stacking up ahead of the voice.
 */
function drainStreamBuffer(
  targetBcp47: string,
  nativeBcp47: string,
  phase: string,
  isFinal = false,
): void {
  if (streamTtsStopped) return;

  let group = '';

  const emit = () => {
    if (group && hasSpeakableContent(group)) {
      enqueueMixedText(group, targetBcp47, nativeBcp47, phase);
    }
    group = '';
  };

  while (!streamTtsStopped) {
    const idx = findSentenceEnd(streamTtsBuffer, isFinal);
    if (idx === -1) break;

    const sentence = streamTtsBuffer.slice(0, idx).trim();
    streamTtsBuffer = streamTtsBuffer.slice(idx).trimStart();

    if (!hasSpeakableContent(sentence)) continue;

    // Never make the FIRST sentence wait on a second one — time to first
    // sound is what the learner actually perceives as responsiveness.
    if (!group && utteranceQueue.length === 0 && !queuePump) {
      group = sentence;
      emit();
      continue;
    }

    group = group ? `${group} ${sentence}` : sentence;
    if (group.length >= MAX_GROUPED_CHARS) emit();
  }

  emit();
}

/**
 * Feeds a chunk of the model's streaming reply to the speaker. Call this from
 * the stream's token handler; each completed sentence is queued as soon as it
 * is available, while the model is still generating the rest.
 */
export function feedStreamTts(chunk: string, targetBcp47: string, nativeBcp47: string, phase: string): void {
  if (streamTtsStopped || !chunk) return;
  streamTtsBuffer += chunk;
  drainStreamBuffer(targetBcp47, nativeBcp47, phase);
}

/**
 * Speaks whatever is left in the buffer once the model has finished — the
 * final sentence often arrives without trailing punctuation. Resolves when
 * the queue has fully drained, so callers can await the end of speech.
 */
export async function flushStreamTts(targetBcp47: string, nativeBcp47: string, phase: string): Promise<void> {
  if (streamTtsStopped) return;

  // Generation is over, so a terminator at the end of the buffer is now a real
  // sentence end rather than a chunk boundary — drain those first.
  drainStreamBuffer(targetBcp47, nativeBcp47, phase, true);
  if (streamTtsStopped) return;

  const tail = streamTtsBuffer.trim();
  streamTtsBuffer = '';
  if (tail && hasSpeakableContent(tail)) {
    enqueueMixedText(tail, targetBcp47, nativeBcp47, phase);
  }

  await drainQueue();
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

/**
 * Runs `speak` as soon as the browser will actually let audio out, and not
 * before. Every other line the character says follows a click or a mic press,
 * so the context is already running by then; a line the app starts on its own
 * (the welcome-back recap of a resumed session) can arrive while the page has
 * never been interacted with, and autoplay policy silently swallows it. Waiting
 * for the first gesture defers the line instead of losing it.
 *
 * Returns a canceller for callers that unmount before the gesture arrives.
 */
export function speakWhenAudioUnlocked(speak: () => void): () => void {
  let settled = false;
  const gestures = ['pointerdown', 'keydown', 'touchstart'] as const;

  const detach = () => {
    for (const g of gestures) window.removeEventListener(g, run);
  };
  function run(): void {
    if (settled) return;
    settled = true;
    detach();
    unlockAudio();
    speak();
  }

  let ctx: AudioContext | null = null;
  try {
    ctx = getAudioContext();
  } catch { /* no Web Audio at all — let the caller try and fail on its own */ }

  if (!ctx || ctx.state === 'running') {
    run();
    return () => { settled = true; };
  }

  for (const g of gestures) window.addEventListener(g, run);
  // A context suspended only by the tab's own lifecycle (not by a missing
  // gesture) resumes here, and the line plays without waiting for input.
  void ctx.resume().then(() => { if (ctx?.state === 'running') run(); }).catch(() => {});

  return () => { settled = true; detach(); };
}

export function stopStreamingTts(): void {
  streamTtsStopped = true;
  streamTtsBuffer = '';
}

export function resetStreamingTts(): void {
  streamTtsStopped = false;
  streamTtsBuffer = '';
}
