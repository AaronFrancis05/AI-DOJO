'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  startContinuousRecognition,
  stopContinuousRecognition,
  ensureRecognizer,
} from '@/lib/roleplay/pronunciation';

export interface UseVoiceInputOptions {
  lang?: string;
  onFinal?: (text: string) => void;
}

export interface UseVoiceInputReturn {
  isListening: boolean;
  partialTranscript: string;
  finalTranscript: string;
  volumeLevel: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  error: string | null;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { lang = 'ja-JP', onFinal } = options;
  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef('');
  const isListeningRef = useRef(false);

  const start = useCallback(async () => {
    if (isListeningRef.current) return;
    finalRef.current = '';
    setFinalTranscript('');
    setPartialTranscript('');
    isListeningRef.current = true;
    setError(null);
    setIsListening(true);
    try {
      await ensureRecognizer(lang);
      await startContinuousRecognition(lang, {
        onInterim: (text: string) => {
          setPartialTranscript(text);
          setVolumeLevel(Math.min(1, text.length / 50));
        },
        onFinal: (text: string) => {
          finalRef.current += text;
          setFinalTranscript(finalRef.current);
          setPartialTranscript('');
          onFinal?.(text);
        },
        onError: async (err: string) => {
          await stopContinuousRecognition();
          setError(err);
          isListeningRef.current = false;
          setIsListening(false);
        },
      });
    } catch (e: any) {
      await stopContinuousRecognition();
      setError(e.message ?? 'Failed to start voice input');
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [lang, onFinal]);

  const stop = useCallback(async () => {
    isListeningRef.current = false;
    setIsListening(false);
    await stopContinuousRecognition();
  }, []);

  useEffect(() => {
    return () => {
      if (isListeningRef.current) {
        stopContinuousRecognition().catch(() => {});
      }
    };
  }, []);

  return {
    isListening,
    partialTranscript,
    finalTranscript,
    volumeLevel,
    start,
    stop,
    error,
  };
}
