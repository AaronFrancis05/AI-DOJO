import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

let cachedToken: { token: string; region: string } | null = null;
let recognizer: SpeechSDK.SpeechRecognizer | null = null;
let currentLang: string | null = null;

export type RecognizerCallbacks = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: string) => void;
};

let activeCallbacks: RecognizerCallbacks | null = null;

async function fetchToken(): Promise<{ token: string; region: string }> {
  const res = await fetch('/api/speech/token');
  if (!res.ok) throw new Error('Failed to fetch speech token');
  const data = await res.json();
  return { token: data.token, region: data.region };
}

async function getToken(): Promise<{ token: string; region: string }> {
  if (cachedToken) return cachedToken;
  cachedToken = await fetchToken();
  return cachedToken;
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
  return new Promise((resolve) => {
    if (recognizer) {
      recognizer.stopContinuousRecognitionAsync(
        () => resolve(),
        () => resolve(),
      );
    } else {
      resolve();
    }
  });
}

export function destroyRecognizer(): void {
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
