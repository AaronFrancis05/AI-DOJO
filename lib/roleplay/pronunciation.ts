import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

/* ── Overview ───────────────────────────────────────────────────────────
   Microphone capture and speech recognition for the roleplay session.

   Push-to-talk has to feel instant, so everything expensive is acquired
   once per session and held warm rather than rebuilt on every press:

   - ONE microphone MediaStream, shared by the recognizer and the level
     meter. These previously called getUserMedia separately, so each press
     paid for a second device acquisition (and built a fresh AudioContext
     that was never reused).
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

async function acquireMicStream(): Promise<MediaStream> {
  // A stream whose track has ended (device unplugged, permission revoked,
  // OS reclaimed it) must be re-acquired rather than handed back dead.
  if (micStream && micStream.getAudioTracks().some(t => t.readyState === 'live')) {
    return micStream;
  }

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

/* ── Level meter ────────────────────────────────────────────────────────
   Drives the mic button's visual feedback directly from the shared stream,
   so the learner sees their voice registering immediately rather than
   waiting for a transcript to prove sound arrived.
   ────────────────────────────────────────────────────────────────────── */

let meterCtx: AudioContext | null = null;
let meterAnalyser: AnalyserNode | null = null;
let meterSource: MediaStreamAudioSourceNode | null = null;
let meterRaf: number | null = null;

async function startVolumeMeter(onLevel: (level: number) => void): Promise<void> {
  try {
    const stream = await acquireMicStream();

    // Built once per session and reused; only the animation loop restarts.
    if (!meterCtx || meterCtx.state === 'closed') {
      meterCtx = new AudioContext();
      meterAnalyser = meterCtx.createAnalyser();
      meterAnalyser.fftSize = 256;
      meterAnalyser.smoothingTimeConstant = 0.6;
      meterSource = null;
    }
    if (meterCtx.state === 'suspended') await meterCtx.resume();
    if (!meterSource) {
      meterSource = meterCtx.createMediaStreamSource(stream);
      meterSource.connect(meterAnalyser!);
    }

    const analyser = meterAnalyser!;
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
  } catch {
    // The recognizer owns the actual capture; if the meter can't start we
    // lose the visual only, never the audio.
  }
}

function stopVolumeMeter(): void {
  if (meterRaf != null) cancelAnimationFrame(meterRaf);
  meterRaf = null;
}

function teardownVolumeMeter(): void {
  stopVolumeMeter();
  try { meterSource?.disconnect(); } catch { /* ignore */ }
  meterSource = null;
  meterAnalyser = null;
  meterCtx?.close().catch(() => {});
  meterCtx = null;
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
      void rebuildRecognizer().catch(() => {
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
  const stream = await acquireMicStream();

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = lang;
  // Commit short utterances promptly instead of waiting out Azure's default
  // end-of-phrase silence, which reads as the mic "not transmitting".
  speechConfig.setProperty(
    SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs,
    SEGMENTATION_SILENCE_MS,
  );

  // Feed the recognizer from the shared session stream rather than letting it
  // open the default microphone itself, so there is exactly one capture.
  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(stream);
  const reco = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  attachHandlers(reco);

  recognizer = reco;
  currentLang = lang;

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

async function rebuildRecognizer(): Promise<void> {
  const lang = currentLang;
  if (!lang) return;
  closeRecognizer();
  await buildRecognizer(lang);
}

function closeRecognizer(): void {
  isRecognizing = false;
  try { connection?.closeConnection(); } catch { /* ignore */ }
  try { connection?.close(); } catch { /* ignore */ }
  connection = null;
  try { recognizer?.close(); } catch { /* ignore */ }
  recognizer = null;
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

export async function ensureRecognizer(lang: string): Promise<void> {
  if (recognizer && currentLang === lang) return;

  // Concurrent callers (a prewarm racing the first press) must share one
  // build rather than each constructing a recognizer and leaking the loser.
  if (recognizerPromise && pendingLang === lang) return recognizerPromise;

  if (recognizer) closeRecognizer();

  pendingLang = lang;
  recognizerPromise = buildRecognizer(lang).finally(() => {
    recognizerPromise = null;
    pendingLang = null;
  });
  return recognizerPromise;
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

  await ensureRecognizer(lang);

  if (callbacks.onVolume) void startVolumeMeter(callbacks.onVolume);

  // Already streaming from a previous press that hasn't fully stopped —
  // adopting the new callbacks is enough, and skips a needless restart.
  if (isRecognizing) return;

  return new Promise((resolve) => {
    recognizer!.startContinuousRecognitionAsync(
      () => { isRecognizing = true; resolve(); },
      (err) => {
        isRecognizing = false;
        activeCallbacks?.onError(String(err));
        resolve();
      },
    );
  });
}

export function stopContinuousRecognition(): Promise<void> {
  stopVolumeMeter();

  return new Promise((resolve) => {
    if (!recognizer || !isRecognizing) {
      activeCallbacks = null;
      resolve();
      return;
    }

    // activeCallbacks stays live until the SDK has flushed its final
    // Recognized events — otherwise an utterance that finalizes right on
    // pointer-up would be dropped.
    const done = () => { isRecognizing = false; activeCallbacks = null; resolve(); };
    recognizer.stopContinuousRecognitionAsync(done, done);
  });
}

/**
 * Full teardown for session unmount: closes the recognizer and connection,
 * releases the microphone, and disposes the level meter's audio graph.
 */
export function destroyRecognizer(): void {
  teardownVolumeMeter();
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
