import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

let cachedToken: { token: string; region: string } | null = null;
let recognizer: SpeechSDK.SpeechRecognizer | null = null;

async function getToken(): Promise<{ token: string; region: string }> {
  if (cachedToken) return cachedToken;
  const res = await fetch('/api/speech/token');
  if (!res.ok) throw new Error('Failed to fetch speech token');
  const data = await res.json();
  cachedToken = { token: data.token, region: data.region };
  return cachedToken!;
}

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

export type RecognizerCallbacks = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: string) => void;
};

export async function startContinuousRecognition(
  lang: string,
  callbacks: RecognizerCallbacks,
): Promise<void> {
  const { token, region } = await getToken();

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = lang;

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  recognizer.recognizing = (_s, e) => {
    callbacks.onInterim(e.result.text);
  };

  recognizer.recognized = (_s, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      callbacks.onFinal(e.result.text);
    }
  };

  recognizer.canceled = (_s, e) => {
    callbacks.onError(e.errorDetails ?? 'Canceled');
  };

  recognizer.sessionStopped = () => {
    // continuous session ended
  };

  return new Promise((resolve) => {
    recognizer!.startContinuousRecognitionAsync(
      () => resolve(),
      (err) => {
        callbacks.onError(String(err));
        resolve();
      },
    );
  });
}

export function stopContinuousRecognition(): void {
  if (recognizer) {
    recognizer.stopContinuousRecognitionAsync();
    recognizer.close();
    recognizer = null;
  }
}