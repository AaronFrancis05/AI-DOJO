'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  startContinuousRecognition,
  stopContinuousRecognition,
  prewarmRecognizer,
  destroyRecognizer,
} from '@/lib/roleplay/pronunciation';
import { playMicPress, playMicRelease } from '@/lib/roleplay/mic-sfx';
import { markMicRelease } from '@/lib/roleplay/voice-latency';

// How long a release waits for Azure to flush a final result before falling
// back to the last interim. It only ever pays out when a phrase was still being
// recognized at the moment of release — the common case transmits with no wait —
// and it ends the moment that final lands.
const FINAL_FLUSH_GRACE_MS = 250;

export interface UseVoiceInputOptions {
  lang?: string;
  onFinal?: (text: string) => void;
  /**
   * Whether this hook prewarms and tears down the shared recognizer. Session
   * views set it false: the recognizer is built once per session by
   * `RoleplaySessionProvider` and must survive the voice ⇄ avatar tab switch,
   * which unmounts this hook. Standalone surfaces (tryout) leave it true.
   */
  ownsRecognizer?: boolean;
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
  const { lang = 'ja-JP', onFinal, ownsRecognizer = true } = options;
  const [isListening, setIsListening] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef('');
  const partialRef = useRef('');
  const isListeningRef = useRef(false);
  // Tracks the in-flight start() call so stop() (fired by a quick
  // pointerup/pointerleave on push-to-talk buttons) never races ahead of the
  // recognizer actually attaching its handlers — otherwise a fast, short
  // utterance can be cut off before it's ever captured.
  const startPromiseRef = useRef<Promise<void> | null>(null);
  // Set while a release is waiting on a final result, so the arrival of that
  // result can end the wait instead of running out the grace period.
  const finalWaiterRef = useRef<(() => void) | null>(null);

  // Prefetch the token + construct the recognizer as soon as this component
  // mounts, so the first mic press doesn't pay for a network round trip
  // before audio capture can begin.
  useEffect(() => {
    if (!ownsRecognizer) return;
    prewarmRecognizer(lang).catch(() => {
      // Surfaced again (and retried) on the next explicit start() call.
    });
  }, [lang, ownsRecognizer]);

  const start = useCallback(async () => {
    if (isListeningRef.current) return;
    // Confirm the press in the same frame it happened, before anything is
    // awaited — the earcon is the learner's proof the mic is already open.
    playMicPress();
    finalRef.current = '';
    partialRef.current = '';
    setFinalTranscript('');
    setPartialTranscript('');
    setVolumeLevel(0);
    isListeningRef.current = true;
    setError(null);
    setIsListening(true);

    // Called directly rather than behind an `await ensureRecognizer(lang)`:
    // startContinuousRecognition ensures the recognizer itself, and its
    // synchronous prefix is what opens the capture gate. Awaiting anything
    // first would push that gate past the press by at least a microtask —
    // and, on a cold recognizer, past a network round trip.
    const startPromise = (async () => {
      await startContinuousRecognition(lang, {
        onInterim: (text: string) => {
          partialRef.current = text;
          setPartialTranscript(text);
        },
        onFinal: (text: string) => {
          // Push-to-talk: buffer while held, transmit only on release.
          // Accumulate so a long hold with multiple utterances is sent as one turn.
          finalRef.current = finalRef.current ? `${finalRef.current} ${text}` : text;
          partialRef.current = '';
          setFinalTranscript(finalRef.current);
          setPartialTranscript('');
          // A release already waiting on this result transmits now.
          finalWaiterRef.current?.();
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
    // pointerup, pointerleave and blur all fire on one release; only the
    // first is the release, and only it should sound or transmit.
    if (!isListeningRef.current) return;

    isListeningRef.current = false;
    setIsListening(false);
    setVolumeLevel(0);
    playMicRelease();

    const stopping = stopContinuousRecognition();

    // Whether a phrase was still mid-recognition when the button came up.
    // Azure ends a phrase after SEGMENTATION_SILENCE_MS of quiet, so a learner
    // who pauses to think mid-sentence — the norm in a lesson — finalizes the
    // first half and is still speaking the second when they let go. Keying the
    // wait on "nothing has finalized yet" transmitted that first half alone and
    // threw the rest away, which is what produced half-sentence turns.
    const phraseInFlight = Boolean(partialRef.current.trim());

    if (phraseInFlight || !finalRef.current.trim()) {
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const flushed = new Promise<void>((resolve) => {
        finalWaiterRef.current = resolve;
        graceTimer = setTimeout(resolve, FINAL_FLUSH_GRACE_MS);
      });
      // A phrase known to be in flight waits for its own final. Racing the
      // SDK's teardown here would resolve first whenever stopContinuousRecognitionAsync
      // reports back before the service has returned that last Recognized event,
      // reintroducing the same truncation this guards against.
      await (phraseInFlight ? flushed : Promise.race([stopping, flushed]));
      if (graceTimer) clearTimeout(graceTimer);
      finalWaiterRef.current = null;
    }

    // Release-to-transmit: flush every phrase captured while held. Finalized
    // text and a still-unfinalized trailing interim are DIFFERENT segments of
    // one utterance, so they are joined rather than chosen between — taking
    // only the finalized half is exactly how the tail went missing.
    const buffered = [finalRef.current, partialRef.current]
      .map(s => s.trim())
      .filter(Boolean)
      .join(' ');

    if (buffered) {
      finalRef.current = '';
      partialRef.current = '';
      setPartialTranscript('');
      setFinalTranscript('');
      markMicRelease();
      onFinal?.(buffered);
    }
  }, [onFinal]);

  // The recognizer, its Azure connection, and the microphone stream are held
  // warm for the whole session so push-to-talk stays instant. Leaving the
  // session is the point at which they must actually be released — otherwise
  // the mic indicator stays lit and the stream leaks across navigations.
  // Session views hand that release to RoleplaySessionProvider instead, so
  // switching between the voice and avatar tabs doesn't tear down and rebuild
  // the recognizer mid-session.
  useEffect(() => {
    if (!ownsRecognizer) return;
    return () => { destroyRecognizer(); };
  }, [ownsRecognizer]);

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
