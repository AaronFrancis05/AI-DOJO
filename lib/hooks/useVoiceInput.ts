'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  startContinuousRecognition,
  stopContinuousRecognition,
  ensureRecognizer,
  prewarmRecognizer,
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
  // Tracks the in-flight start() call so stop() (fired by a quick
  // pointerup/pointerleave on push-to-talk buttons) never races ahead of the
  // recognizer actually attaching its handlers — otherwise a fast, short
  // utterance can be cut off before it's ever captured.
  const startPromiseRef = useRef<Promise<void> | null>(null);

  // Prefetch the token + construct the recognizer as soon as this component
  // mounts, so the first mic press doesn't pay for a network round trip
  // before audio capture can begin.
  useEffect(() => {
    prewarmRecognizer(lang).catch(() => {
      // Surfaced again (and retried) on the next explicit start() call.
    });
  }, [lang]);

  const start = useCallback(async () => {
    if (isListeningRef.current) return;
    finalRef.current = '';
    setFinalTranscript('');
    setPartialTranscript('');
    setVolumeLevel(0);
    isListeningRef.current = true;
    setError(null);
    setIsListening(true);

    const startPromise = (async () => {
      await ensureRecognizer(lang);
      await startContinuousRecognition(lang, {
        onInterim: (text: string) => {
          setPartialTranscript(text);
        },
        onFinal: (text: string) => {
          finalRef.current += text;
          setFinalTranscript(finalRef.current);
          setPartialTranscript('');
          onFinal?.(text);
        },
        onVolume: (level: number) => {
          setVolumeLevel(level);
        },
        onError: async (err: string) => {
          await stopContinuousRecognition();
          setError(err);
          isListeningRef.current = false;
          setIsListening(false);
          setVolumeLevel(0);
        },
      });
    })();

    startPromiseRef.current = startPromise;
    try {
      await startPromise;
    } catch (e: any) {
      await stopContinuousRecognition();
      setError(e.message ?? 'Failed to start voice input');
      isListeningRef.current = false;
      setIsListening(false);
      setVolumeLevel(0);
    } finally {
      if (startPromiseRef.current === startPromise) startPromiseRef.current = null;
    }
  }, [lang, onFinal]);

  const stop = useCallback(async () => {
    if (startPromiseRef.current) {
      await startPromiseRef.current.catch(() => {});
    }
    isListeningRef.current = false;
    setIsListening(false);
    setVolumeLevel(0);
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
