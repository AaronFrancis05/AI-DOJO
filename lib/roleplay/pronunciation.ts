import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

/* ── Overview ───────────────────────────────────────────────────────────
   Microphone capture and speech recognition for the roleplay session.

   Push-to-talk has to feel instant, so everything expensive is acquired
   once per session and held warm rather than rebuilt on every press:

   - ONE microphone MediaStream and ONE AudioContext, shared by the level
     meter and the PCM tap. These previously called getUserMedia separately,
     so each press paid for a second device acquisition (and built a fresh
     AudioContext that was never reused).
   - The tap runs continuously and feeds the recognizer through a push
     stream, so a press opens a gate that is already carrying audio instead
     of starting a capture. Audio spoken while the SDK opens its recognition
     session is buffered, not clipped.
   - The recognizer's websocket to Azure is opened ahead of time and kept
     open, so a press starts streaming audio immediately instead of waiting
     out a handshake. Recognition itself still only runs while the button is
     held — an always-on recognition session would bill continuously and
     would transcribe the AI's own voice coming back through the speakers.
   - Result handlers are attached once at construction rather than being
     reassigned on every press.
   ────────────────────────────────────────────────────────────────────── */

// Azure Speech authorization tokens expire after 10 minutes — refresh a
// minute early so a long session never silently stops capturing audio.
const TOKEN_TTL_MS = 9 * 60 * 1000;
const TOKEN_REFRESH_INTERVAL_MS = 8 * 60 * 1000;

// How much trailing silence ends a phrase. Azure's default is conservative
// (~500ms+), which shows up as a lag between the learner finishing a short
// utterance and the recognizer committing it.
const SEGMENTATION_SILENCE_MS = '350';

let cachedToken: { token: string; region: string; expiresAt: number } | null = null;
let tokenPromise: Promise<{ token: string; region: string }> | null = null;
let recognizer: SpeechSDK.SpeechRecognizer | null = null;
let connection: SpeechSDK.Connection | null = null;
let currentLang: string | null = null;
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
let recognizerPromise: Promise<void> | null = null;
// An in-flight stopContinuousRecognitionAsync. A press landing during one
// must wait it out rather than start a session the teardown then stops.
let stopPromise: Promise<void> | null = null;
// The language the in-flight build is for. `currentLang` is only set once
// buildRecognizer has finished, so it cannot be used to decide whether a
// concurrent caller can join the build already running.
let pendingLang: string | null = null;
let isRecognizing = false;

export type RecognizerCallbacks = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: string) => void;
  onVolume?: (level: number) => void;
};

let activeCallbacks: RecognizerCallbacks | null = null;

async function fetchToken(): Promise<{ token: string; region: string }> {
  const res = await fetch('/api/speech/token', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch speech token');
  const data = await res.json();
  return { token: data.token, region: data.region };
}

/**
 * Shared Azure Speech authorization token, cached until just before expiry.
 *
 * Exported so the TTS layer (lib/roleplay/tts.ts) can authorize its own
 * browser-side synthesizer from the same cache instead of standing up a
 * second token endpoint client and a second refresh timer.
 */
export async function getToken(): Promise<{ token: string; region: string }> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken;
  if (!tokenPromise) {
    tokenPromise = fetchToken().finally(() => { tokenPromise = null; });
  }
  const { token, region } = await tokenPromise;
  cachedToken = { token, region, expiresAt: Date.now() + TOKEN_TTL_MS };
  return cachedToken;
}

/* ── Shared microphone stream ───────────────────────────────────────────
   Acquired once and reused for the whole session. Device acquisition is
   the single slowest step in starting capture, so it must not sit on the
   push-to-talk path.
   ────────────────────────────────────────────────────────────────────── */

let micStream: MediaStream | null = null;
let micStreamPromise: Promise<MediaStream> | null = null;

/**
 * Whether a track is actually delivering audio.
 *
 * `muted` matters as much as `readyState` here, and is the more insidious of
 * the two: a muted track is still "live", so it passes every liveness check
 * while feeding the tap nothing but digital silence. It goes muted when
 * another application takes exclusive hold of the device, when the OS reclaims
 * it, or when a Bluetooth headset switches profile — none of which raise an
 * error anywhere. The press then produces no transcript and no explanation,
 * which is one of the ways the microphone appears to "sometimes not work".
 */
function isTrackDelivering(track: MediaStreamTrack): boolean {
  return track.readyState === 'live' && !track.muted;
}

async function acquireMicStream(): Promise<MediaStream> {
  // A stream whose track has ended (device unplugged, permission revoked,
  // OS reclaimed it) or gone muted must be re-acquired rather than handed
  // back dead. Re-acquiring is cheap once permission has been granted.
  if (micStream && micStream.getAudioTracks().some(isTrackDelivering)) {
    return micStream;
  }
  if (micStream) releaseMicStream();

  if (!micStreamPromise) {
    micStreamPromise = navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,   // keeps the AI's own TTS out of the transcript
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        micStream = stream;
        // Drop the reference as soon as the device stops delivering, so the
        // next press re-acquires instead of reusing a stream that has gone
        // silent underneath us. Deliberately NOT surfaced as an error: some
        // browsers report a track muted for a moment right after granting it,
        // and failing a working microphone would be worse than the silence
        // this guards against. The "no speech detected" message on release is
        // what tells the learner something went wrong.
        for (const track of stream.getAudioTracks()) {
          track.addEventListener('ended', () => { if (micStream === stream) micStream = null; });
          track.addEventListener('mute', () => { if (micStream === stream) micStream = null; });
        }
        return stream;
      })
      .finally(() => { micStreamPromise = null; });
  }

  return micStreamPromise;
}

function releaseMicStream(): void {
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
}

/* ── Input audio graph ──────────────────────────────────────────────────
   One AudioContext over the shared stream, feeding two consumers:

   - the level meter, which drives the mic button's visual so the learner
     sees their voice registering without waiting for a transcript;
   - a PCM tap, which streams audio into the recognizer's push stream.

   The tap runs for the whole session, not only while the button is held.
   That is what makes a press capture instantly: audio is already flowing
   when the press lands, so whatever is spoken while the SDK is still opening
   its recognition session is buffered rather than clipped, and the last
   PRE_ROLL_MS before the press are prepended on top of that.

   Between presses the tap keeps only the rolling pre-roll window and writes
   nothing to the recognizer, so nothing is transmitted or billed while the
   button is up.
   ────────────────────────────────────────────────────────────────────── */

/** The recognizer's push stream is fed 16 kHz mono 16-bit PCM. */
const TARGET_SAMPLE_RATE = 16000;
/** Audio retained from just before the press, so a word begun on it survives. */
const PRE_ROLL_MS = 300;
/**
 * Audio still admitted just AFTER the release, for the mirror-image reason.
 *
 * A learner lets go of the button on the last syllable, not a beat after it,
 * so slamming the gate shut on the release itself cut the tail off the final
 * word — and left Azure with no trailing audio to segment the phrase on, which
 * made it slower to commit the final result too. There was 300ms of pre-roll at
 * the front and nothing at all at the back.
 *
 * This costs nothing on the critical path: the release-to-transmit wait in
 * lib/hooks/useVoiceInput.ts is already sitting on the recognizer's final
 * result, which could not have arrived any sooner.
 */
const POST_ROLL_MS = 250;
/** Cap on audio held while a cold recognizer is still being built. */
const MAX_PENDING_MS = 5000;
/** ScriptProcessor fallback block size (~43ms at 48 kHz). */
const FALLBACK_BLOCK_SIZE = 2048;

// Loaded from a blob URL so the tap needs no separate public asset.
const TAP_WORKLET_SOURCE = `
class MicTapProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      const block = new Float32Array(channel);
      this.port.postMessage(block, [block.buffer]);
    }
    return true;
  }
}
registerProcessor('mic-tap', MicTapProcessor);
`;

let audioCtx: AudioContext | null = null;
let graphStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let meterAnalyser: AnalyserNode | null = null;
let tapNode: AudioNode | null = null;
let tapSink: GainNode | null = null;
let tapModuleUrl: string | null = null;
let audioGraphPromise: Promise<void> | null = null;
let meterRaf: number | null = null;
let resumeHandler: (() => void) | null = null;

// Where the tap's audio goes. `preRoll` is the rolling window kept while the
// button is up; `pending` holds audio captured before the push stream exists.
let pushStream: SpeechSDK.PushAudioInputStream | null = null;
let capturing = false;
let preRoll: Int16Array[] = [];
let preRollSamples = 0;
let pending: Int16Array[] = [];
let pendingSamples = 0;
let resampleCarry = new Float32Array(0);
let resampleOffset = 0;

/**
 * Converts one block of the context's float audio to 16 kHz 16-bit PCM,
 * carrying the fractional window position across blocks so the boundaries
 * don't click.
 */
function toTargetRatePcm(block: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / TARGET_SAMPLE_RATE;

  let buf = block;
  if (resampleCarry.length) {
    buf = new Float32Array(resampleCarry.length + block.length);
    buf.set(resampleCarry, 0);
    buf.set(block, resampleCarry.length);
  }

  const out = new Int16Array(Math.ceil(buf.length / ratio) + 1);
  let pos = resampleOffset;
  let count = 0;

  while (pos + ratio <= buf.length) {
    const start = Math.floor(pos);
    const end = Math.max(start + 1, Math.min(buf.length, Math.floor(pos + ratio)));
    let sum = 0;
    for (let i = start; i < end; i++) sum += buf[i];
    // Averaging the source window low-passes as it decimates. Dropping
    // samples instead aliases, and aliasing measurably hurts recognition.
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    out[count++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    pos += ratio;
  }

  const consumed = Math.floor(pos);
  resampleCarry = buf.slice(consumed);
  resampleOffset = pos - consumed;
  return out.slice(0, count);
}

function writePcm(pcm: Int16Array): void {
  if (!pushStream) return;
  try {
    pushStream.write(
      pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer,
    );
  } catch {
    // Stream closed underneath us mid-teardown; the next build makes a new one.
  }
}

function trimBuffer(chunks: Int16Array[], samples: number, maxMs: number): number {
  const max = (maxMs / 1000) * TARGET_SAMPLE_RATE;
  let total = samples;
  while (total > max && chunks.length > 1) total -= chunks.shift()!.length;
  return total;
}

function handleAudioBlock(block: Float32Array): void {
  if (!audioCtx) return;
  const pcm = toTargetRatePcm(block, audioCtx.sampleRate);
  if (!pcm.length) return;

  if (!capturing) {
    preRoll.push(pcm);
    preRollSamples = trimBuffer(preRoll, preRollSamples + pcm.length, PRE_ROLL_MS);
    return;
  }

  if (pushStream) {
    writePcm(pcm);
    return;
  }

  // Cold first press: the recognizer is still being built, so hold the audio
  // rather than lose the opening words. Bounded, so a build that never
  // finishes can't grow this without limit.
  pending.push(pcm);
  pendingSamples = trimBuffer(pending, pendingSamples + pcm.length, MAX_PENDING_MS);
}

function flushPending(): void {
  if (!pushStream || !pending.length) return;
  for (const chunk of pending) writePcm(chunk);
  pending = [];
  pendingSamples = 0;
}

/**
 * Bumped on every press. A post-roll that is still counting down when the next
 * press lands must not close the gate that press just opened.
 */
let captureEpoch = 0;
let postRollTimer: ReturnType<typeof setTimeout> | null = null;
let postRollDone: (() => void) | null = null;

/** Ends the post-roll early, without closing the gate. */
function cancelPostRoll(): void {
  if (postRollTimer) { clearTimeout(postRollTimer); postRollTimer = null; }
  const done = postRollDone;
  postRollDone = null;
  done?.();
}

function awaitPostRoll(): Promise<void> {
  return new Promise<void>((resolve) => {
    postRollDone = resolve;
    postRollTimer = setTimeout(() => {
      postRollTimer = null;
      postRollDone = null;
      resolve();
    }, POST_ROLL_MS);
  });
}

/** Opens the gate from the tap to the recognizer. Synchronous by design. */
function beginCapture(): void {
  // A press landing inside the previous release's post-roll ends it now, so
  // the teardown behind it doesn't sit on a timer this press is waiting out.
  cancelPostRoll();
  if (capturing) return;
  capturing = true;
  captureEpoch++;

  // The rolling window is the moment immediately before the press — send it
  // ahead of the live audio so the utterance starts where the learner did.
  for (const chunk of preRoll) {
    if (pushStream) {
      writePcm(chunk);
    } else {
      pending.push(chunk);
      pendingSamples += chunk.length;
    }
  }
  preRoll = [];
  preRollSamples = 0;
}

function endCapture(): void {
  capturing = false;
  pending = [];
  pendingSamples = 0;
}

async function createTapNode(ctx: AudioContext): Promise<AudioNode> {
  if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
    try {
      if (!tapModuleUrl) {
        tapModuleUrl = URL.createObjectURL(
          new Blob([TAP_WORKLET_SOURCE], { type: 'application/javascript' }),
        );
      }
      await ctx.audioWorklet.addModule(tapModuleUrl);
      const node = new AudioWorkletNode(ctx, 'mic-tap', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => handleAudioBlock(e.data);
      return node;
    } catch {
      // Browsers without AudioWorklet (or with blob modules blocked) fall
      // through to the deprecated-but-universal node below.
    }
  }

  const node = ctx.createScriptProcessor(FALLBACK_BLOCK_SIZE, 1, 1);
  node.onaudioprocess = (e) => handleAudioBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
  return node;
}

function armContextResume(): void {
  // A context built at mount — before any user gesture — starts suspended,
  // which would leave the tap silent until the first press. Resuming on the
  // first interaction anywhere means even that press keeps its pre-roll.
  if (resumeHandler || typeof document === 'undefined') return;
  resumeHandler = () => { void audioCtx?.resume().catch(() => {}); };
  document.addEventListener('pointerdown', resumeHandler, { capture: true, passive: true });
  document.addEventListener('keydown', resumeHandler, { capture: true });
}

function disarmContextResume(): void {
  if (!resumeHandler || typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', resumeHandler, { capture: true });
  document.removeEventListener('keydown', resumeHandler, { capture: true });
  resumeHandler = null;
}

async function buildAudioGraph(): Promise<void> {
  const stream = await acquireMicStream();

  if (!audioCtx || audioCtx.state === 'closed') {
    // Asking for the recognizer's own rate lets the browser resample once in
    // native code; toTargetRatePcm covers the browsers that decline.
    try {
      audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    } catch {
      audioCtx = new AudioContext();
    }
    micSource = null;
    meterAnalyser = null;
    tapNode = null;
    tapSink = null;
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume().catch(() => {});
    if (audioCtx.state === 'suspended') armContextResume();
  }

  // A re-acquired stream (device unplugged, permission re-granted) needs a
  // new source node; the rest of the graph is reused.
  if (!micSource || graphStream !== stream) {
    try { micSource?.disconnect(); } catch { /* ignore */ }

    try {
      micSource = audioCtx.createMediaStreamSource(stream);
    } catch {
      // Some browsers refuse a source whose device rate differs from the
      // context's. Take the device's rate instead and let toTargetRatePcm
      // do the conversion.
      audioCtx.close().catch(() => {});
      audioCtx = new AudioContext();
      meterAnalyser = null;
      tapNode = null;
      tapSink = null;
      resampleCarry = new Float32Array(0);
      resampleOffset = 0;
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
      micSource = audioCtx.createMediaStreamSource(stream);
    }

    graphStream = stream;
    if (meterAnalyser) micSource.connect(meterAnalyser);
    if (tapNode) micSource.connect(tapNode);
  }

  if (!meterAnalyser) {
    meterAnalyser = audioCtx.createAnalyser();
    meterAnalyser.fftSize = 256;
    meterAnalyser.smoothingTimeConstant = 0.6;
    micSource.connect(meterAnalyser);
  }

  if (!tapNode) {
    tapNode = await createTapNode(audioCtx);
    micSource.connect(tapNode);
    // A node with no path to the destination is never pulled, so the tap
    // ends in a muted sink rather than in nothing.
    tapSink = audioCtx.createGain();
    tapSink.gain.value = 0;
    tapNode.connect(tapSink);
    tapSink.connect(audioCtx.destination);
  }
}

function ensureAudioGraph(): Promise<void> {
  if (!audioGraphPromise) {
    audioGraphPromise = buildAudioGraph()
      .catch(() => {
        // Capture is the recognizer's problem to report; a graph that can't
        // be built costs the meter and the pre-roll, not the audio.
      })
      .finally(() => { audioGraphPromise = null; });
  }
  return audioGraphPromise;
}

function startVolumeMeter(onLevel: (level: number) => void): void {
  const analyser = meterAnalyser;
  if (!analyser) return;

  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    onLevel(Math.min(1, rms * 4));
    meterRaf = requestAnimationFrame(tick);
  };

  if (meterRaf != null) cancelAnimationFrame(meterRaf);
  tick();
}

function stopVolumeMeter(): void {
  if (meterRaf != null) cancelAnimationFrame(meterRaf);
  meterRaf = null;
}

function teardownAudioGraph(): void {
  stopVolumeMeter();
  disarmContextResume();

  if (typeof AudioWorkletNode !== 'undefined' && tapNode instanceof AudioWorkletNode) {
    tapNode.port.onmessage = null;
  } else if (tapNode) {
    (tapNode as ScriptProcessorNode).onaudioprocess = null;
  }

  try { tapNode?.disconnect(); } catch { /* ignore */ }
  try { tapSink?.disconnect(); } catch { /* ignore */ }
  try { meterAnalyser?.disconnect(); } catch { /* ignore */ }
  try { micSource?.disconnect(); } catch { /* ignore */ }
  tapNode = null;
  tapSink = null;
  meterAnalyser = null;
  micSource = null;
  graphStream = null;

  audioCtx?.close().catch(() => {});
  audioCtx = null;

  capturing = false;
  preRoll = [];
  preRollSamples = 0;
  pending = [];
  pendingSamples = 0;
  resampleCarry = new Float32Array(0);
  resampleOffset = 0;

  if (tapModuleUrl) {
    URL.revokeObjectURL(tapModuleUrl);
    tapModuleUrl = null;
  }
}

/* ── Recognizer ─────────────────────────────────────────────────────── */

function attachHandlers(reco: SpeechSDK.SpeechRecognizer): void {
  reco.recognizing = (_s, e) => {
    activeCallbacks?.onInterim(e.result.text);
  };

  reco.recognized = (_s, e) => {
    if (e.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) return;
    const text = e.result.text?.trim();
    // Results arriving while nothing is holding the mic are discarded rather
    // than submitted — this is what keeps release-to-transmit honest.
    if (text && activeCallbacks) activeCallbacks.onFinal(text);
  };

  reco.canceled = (_s, e) => {
    isRecognizing = false;

    // A dropped connection mid-session is recoverable: the token may simply
    // have aged out. Rebuild rather than surfacing a dead mic to the learner,
    // and only report an error if that fails too.
    if (e.reason === SpeechSDK.CancellationReason.Error) {
      const detail = e.errorDetails ?? 'Recognition canceled';
      cachedToken = null;
      void rebuildRecognizer()
        .then(() => {
          // The learner may well still be holding the button. The rebuild
          // hands back a recognizer and a fresh push stream that the tap is
          // already feeding — but nothing was CONSUMING it, because a rebuild
          // does not start a recognition session. The rest of that press was
          // captured, transmitted, and never transcribed: no result, no error,
          // and the next press works, which is exactly what "the mic sometimes
          // doesn't pick anything up" looked like from the outside.
          if (capturing) return startRecognitionSession();
        })
        .catch(() => {
          activeCallbacks?.onError(detail);
        });
    }
  };

  reco.sessionStopped = () => {
    isRecognizing = false;
  };
}

async function buildRecognizer(lang: string): Promise<void> {
  const { token, region } = await getToken();
  // Bring the capture graph up alongside the recognizer, so the tap is
  // already running before the learner's first press.
  await ensureAudioGraph();

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = lang;
  // Commit short utterances promptly instead of waiting out Azure's default
  // end-of-phrase silence, which reads as the mic "not transmitting".
  speechConfig.setProperty(
    SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs,
    SEGMENTATION_SILENCE_MS,
  );

  // Audio reaches the recognizer through a push stream fed by the session-long
  // tap, rather than the SDK opening the microphone itself. That decouples
  // "the learner is capturing" from "the SDK is ready", which is what lets a
  // press start capturing on the press rather than after a round trip.
  const stream = SpeechSDK.AudioInputStream.createPushStream(
    SpeechSDK.AudioStreamFormat.getWaveFormatPCM(TARGET_SAMPLE_RATE, 16, 1),
  );
  pushStream = stream;

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(stream);
  const reco = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  attachHandlers(reco);

  recognizer = reco;
  currentLang = lang;

  // Anything captured while this build was in flight goes out now.
  flushPending();

  // Open the websocket now so the first press doesn't pay for the handshake.
  // The Connection reference is held so it isn't garbage collected.
  try {
    connection = SpeechSDK.Connection.fromRecognizer(reco);
    connection.openConnection();
  } catch {
    // Non-fatal: recognition still works, it just pays the handshake on use.
    connection = null;
  }

  startTokenRefresh();
}

/**
 * Starts a recognition session on the current recognizer, if one isn't already
 * running. Shared by the press path and the post-reconnect recovery above, so
 * "audio is flowing" and "something is transcribing it" can't drift apart.
 */
function startRecognitionSession(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!recognizer || isRecognizing) { resolve(); return; }
    recognizer.startContinuousRecognitionAsync(
      () => { isRecognizing = true; resolve(); },
      (err) => {
        isRecognizing = false;
        activeCallbacks?.onError(String(err));
        resolve();
      },
    );
  });
}

async function rebuildRecognizer(): Promise<void> {
  const lang = currentLang;
  if (!lang) return;
  // Join a build already in flight rather than racing it. closeRecognizer()
  // leaves `recognizer` null, so a concurrent ensureRecognizer would see "no
  // recognizer" and start a SECOND build — two recognizers, each with its own
  // websocket, both assigning the module-level `pushStream`. The loser is
  // orphaned still holding an open connection, and the tap's audio goes to
  // whichever one happened to be assigned last.
  if (recognizerPromise && pendingLang === lang) return recognizerPromise;
  closeRecognizer();
  await startBuild(lang);
}

function closeRecognizer(): void {
  isRecognizing = false;
  try { connection?.closeConnection(); } catch { /* ignore */ }
  try { connection?.close(); } catch { /* ignore */ }
  connection = null;
  try { recognizer?.close(); } catch { /* ignore */ }
  recognizer = null;
  try { pushStream?.close(); } catch { /* ignore */ }
  pushStream = null;
  // Cleared with the recognizer it describes: leaving it set means a later
  // ensureRecognizer can believe a torn-down recognizer is still current.
  currentLang = null;
}

function startTokenRefresh(): void {
  if (tokenRefreshTimer) return;
  tokenRefreshTimer = setInterval(async () => {
    if (!recognizer) return;
    try {
      cachedToken = null;
      const { token } = await getToken();
      recognizer.authorizationToken = token;
    } catch {
      // Next getToken() call (e.g. on the next ensureRecognizer) will retry.
    }
  }, TOKEN_REFRESH_INTERVAL_MS);
}

function stopTokenRefresh(): void {
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

/**
 * The single latched build. Every path that constructs a recognizer goes
 * through this, so concurrent callers share one build instead of each
 * constructing their own and leaking the loser.
 */
function startBuild(lang: string): Promise<void> {
  pendingLang = lang;
  recognizerPromise = buildRecognizer(lang).finally(() => {
    recognizerPromise = null;
    pendingLang = null;
  });
  return recognizerPromise;
}

export async function ensureRecognizer(lang: string): Promise<void> {
  if (recognizer && currentLang === lang) return;

  // Concurrent callers (a prewarm racing the first press, or a press racing a
  // reconnect) must share one build.
  if (recognizerPromise && pendingLang === lang) return recognizerPromise;

  if (recognizer) closeRecognizer();

  return startBuild(lang);
}

/**
 * Acquires the microphone, builds the recognizer, and opens the Azure
 * connection ahead of the learner's first press. Call this on session mount.
 */
export async function prewarmRecognizer(lang: string): Promise<void> {
  await ensureRecognizer(lang);
}

export function isRecognizerReady(): boolean {
  return recognizer !== null;
}

export async function startContinuousRecognition(
  lang: string,
  callbacks: RecognizerCallbacks,
): Promise<void> {
  activeCallbacks = callbacks;

  // Everything down to the first await runs synchronously with the press, so
  // the learner's audio is being kept from the instant the button goes down —
  // the recognition session opening behind it only decides when that audio
  // gets transcribed, never whether it was captured.
  beginCapture();
  const graphReady = ensureAudioGraph();

  await ensureRecognizer(lang);
  await graphReady;

  if (callbacks.onVolume) startVolumeMeter(callbacks.onVolume);

  // A release still tearing down would otherwise stop the session started
  // just below it.
  if (stopPromise) await stopPromise;

  // Already streaming from a previous press that hasn't fully stopped —
  // adopting the new callbacks is enough, and skips a needless restart.
  if (isRecognizing) return;

  return startRecognitionSession();
}

export function stopContinuousRecognition(): Promise<void> {
  stopVolumeMeter();

  if (!recognizer || !isRecognizing) {
    endCapture();
    activeCallbacks = null;
    return Promise.resolve();
  }
  if (stopPromise) return stopPromise;

  const owner = activeCallbacks;
  const epoch = captureEpoch;

  const stopping = (async () => {
    // The gate stays open for the post-roll so the tail of the last word, and
    // the trailing audio Azure segments the phrase on, still reach the
    // recognizer. Only then is it told to finalize.
    await awaitPostRoll();
    // Unless a new press has since opened the gate for itself — closing it now
    // would deafen that press instead of ending this one.
    if (captureEpoch === epoch) endCapture();

    await new Promise<void>((resolve) => {
      // activeCallbacks stays live until the SDK has flushed its final
      // Recognized events — otherwise an utterance that finalizes right on
      // pointer-up would be dropped.
      const done = () => {
        isRecognizing = false;
        // A press arriving while this teardown is in flight installs its own
        // callbacks; clearing those here would deafen the new press.
        if (activeCallbacks === owner) activeCallbacks = null;
        resolve();
      };
      recognizer!.stopContinuousRecognitionAsync(done, done);
    });
  })();

  stopPromise = stopping;
  void stopping.finally(() => { if (stopPromise === stopping) stopPromise = null; });
  return stopping;
}

/**
 * Full teardown for session unmount: closes the recognizer and connection,
 * releases the microphone, and disposes the level meter's audio graph.
 */
export function destroyRecognizer(): void {
  cancelPostRoll();
  endCapture();
  teardownAudioGraph();
  stopTokenRefresh();
  closeRecognizer();
  releaseMicStream();
  currentLang = null;
  activeCallbacks = null;
}

// Legacy single-utterance assessment
export interface PronunciationResult {
  transcript: string;
  accuracyScore: number;
}

export async function assessPronunciation(
  referenceText: string,
  lang: string = 'ja-JP',
): Promise<PronunciationResult> {
  const { token, region } = await getToken();

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = lang;

  const stream = await acquireMicStream();
  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(stream);
  const reco = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true,
  );
  pronConfig.applyTo(reco);

  return new Promise((resolve, reject) => {
    reco.recognizeOnceAsync(
      (result) => {
        reco.close();
        if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const details = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
          resolve({
            transcript: result.text,
            accuracyScore: details.accuracyScore ?? 0,
          });
        } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
          resolve({ transcript: '', accuracyScore: 0 });
        } else {
          reject(new Error(`Recognition failed: ${result.errorDetails}`));
        }
      },
      (err) => {
        reco.close();
        reject(err);
      },
    );
  });
}
