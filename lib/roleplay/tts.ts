let currentVisemeId = -1;
let isAzureSpeaking = false;
let azureStopCallback: (() => void) | null = null;

export function getCurrentViseme(): number {
  return currentVisemeId;
}

export function isSpeaking(): boolean {
  return isAzureSpeaking || window.speechSynthesis.speaking;
}

export function speak(text: string, lang: string = 'ja-JP'): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakWithVisemes(
  text: string,
  lang: string = 'ja-JP',
): Promise<void> {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    });

    if (!response.ok) throw new Error(`Azure TTS returned ${response.status}`);

    const data = await response.json();
    const { audio: audioBase64, visemes } = data;

    const binaryStr = atob(audioBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start(0);

    isAzureSpeaking = true;
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
        if (cancelled.value) {
          currentVisemeId = -1;
          isAzureSpeaking = false;
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
          resolve();
          return;
        }

        requestAnimationFrame(tick);
      };

      tick();

      source.onended = () => {
        if (!cancelled.value) {
          currentVisemeId = -1;
          isAzureSpeaking = false;
          resolve();
        }
      };
    });
  } catch {
    currentVisemeId = -1;
    isAzureSpeaking = false;
    return speak(text, lang);
  }
}

export function stop(): void {
  if (azureStopCallback) {
    azureStopCallback();
    azureStopCallback = null;
  }
  window.speechSynthesis.cancel();
  currentVisemeId = -1;
  isAzureSpeaking = false;
}
