import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

// Azure Speech authorization tokens expire after 10 minutes — refresh a
// minute early so a long session never silently stops capturing audio.
const TOKEN_TTL_MS = 9 * 60 * 1000;
const TOKEN_REFRESH_INTERVAL_MS = 8 * 60 * 1000;

let cachedToken: { token: string; region: string; expiresAt: number } | null = null;
let tokenPromise: Promise<{ token: string; region: string }> | null = null;
let recognizer: SpeechSDK.SpeechRecognizer | null = null;
let currentLang: string | null = null;
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

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

async function getToken(): Promise<{ token: string; region: string }> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken;
  if (!tokenPromise) {
    tokenPromise = fetchToken().finally(() => { tokenPromise = null; });
  }
  const { token, region } = await tokenPromise;
  cachedToken = { token, region, expiresAt: Date.now() + TOKEN_TTL_MS };
  return cachedToken;
}

/** Prefetches the speech token and constructs the recognizer ahead of time,
 * so the first mic press doesn't pay for a network round trip before it can
 * start capturing audio. */
export async function prewarmRecognizer(lang: string): Promise<void> {
  await ensureRecognizer(lang);
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

  if (recognizer) {
    recognizer.close();
    recognizer = null;
  }

  const { token, region } = await getToken();
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = lang;

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  currentLang = lang;
  startTokenRefresh();
}

export function isRecognizerReady(): boolean {
  return recognizer !== null;
}

// Real mic amplitude metering, independent of the Speech SDK's own audio
// input — this drives the mic button's visual feedback immediately, instead
// of waiting for a recognized/interim transcript to prove sound is coming in.
let meterStream: MediaStream | null = null;
let meterCtx: AudioContext | null = null;
let meterRaf: number | null = null;

function startVolumeMeter(onLevel: (level: number) => void): void {
  if (!('mediaDevices' in navigator)) return;
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    if (!activeCallbacks) { stream.getTracks().forEach((t) => t.stop()); return; }
    meterStream = stream;
    meterCtx = new AudioContext();
    const source = meterCtx.createMediaStreamSource(stream);
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
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
    tick();
  }).catch(() => {
    // Mic access already granted for the recognizer itself; if this second
    // stream fails we simply skip the visual meter rather than block capture.
  });
}

function stopVolumeMeter(): void {
  if (meterRaf != null) cancelAnimationFrame(meterRaf);
  meterRaf = null;
  meterStream?.getTracks().forEach((t) => t.stop());
  meterStream = null;
  meterCtx?.close().catch(() => {});
  meterCtx = null;
}

export async function startContinuousRecognition(
  lang: string,
  callbacks: RecognizerCallbacks,
): Promise<void> {
  activeCallbacks = callbacks;

  await ensureRecognizer(lang);

  if (callbacks.onVolume) startVolumeMeter(callbacks.onVolume);

  recognizer!.recognizing = (_s, e) => {
    activeCallbacks?.onInterim(e.result.text);
  };

  recognizer!.recognized = (_s, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      const text = e.result.text;
      if (text && text.trim()) {
        activeCallbacks?.onFinal(text.trim());
      }
    }
  };

  recognizer!.canceled = (_s, e) => {
    activeCallbacks?.onError(e.errorDetails ?? 'Canceled');
  };

  recognizer!.sessionStopped = () => {
    // session ended — nothing to do
  };

  return new Promise((resolve) => {
    recognizer!.startContinuousRecognitionAsync(
      () => resolve(),
      (err) => {
        activeCallbacks?.onError(String(err));
        resolve();
      },
    );
  });
}

export function stopContinuousRecognition(): Promise<void> {
  stopVolumeMeter();
  // Keep activeCallbacks alive until the SDK has flushed its final
  // Recognized events — otherwise a release-to-transmit utterance that
  // finalizes right on pointer-up would be dropped.
  return new Promise((resolve) => {
    if (recognizer) {
      recognizer.stopContinuousRecognitionAsync(
        () => { activeCallbacks = null; resolve(); },
        () => { activeCallbacks = null; resolve(); },
      );
    } else {
      activeCallbacks = null;
      resolve();
    }
  });
}

export function destroyRecognizer(): void {
  stopVolumeMeter();
  stopTokenRefresh();
  if (recognizer) {
    recognizer.close();
    recognizer = null;
  }
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

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
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
