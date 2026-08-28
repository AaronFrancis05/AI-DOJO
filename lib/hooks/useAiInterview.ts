/**
 * Drives one learner's spoken interview with the AI examiner.
 *
 * Owns the whole round trip: ask the server for a config-locked ephemeral
 * token, open the Gemini Live socket with it, pump the microphone in, play
 * the examiner's voice out, keep the transcript, and hand it back to be
 * marked.
 *
 * The media path is browser ↔ Gemini. No Stream call: there is no second
 * human in the room, so an SFU would relay audio between two endpoints that
 * never needed a relay. The API key never reaches here — the token does, and
 * the examiner's brief is locked into it server-side, so nothing this file
 * sends can change what the examiner asks or how it marks.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { CAPTURE_MIME_TYPE, MicCapture, SpeakerQueue } from '@/lib/interview/audio';
import { GEMINI_LIVE_API_VERSION } from '@/lib/interview/config';
import type { InterviewerPersona } from '@/lib/interview/persona';
import type { InterviewTurn } from '@/lib/interview/transcript';
import type { TurnScores } from '@/lib/ai-engine';

export type InterviewPhase =
  | 'idle'
  | 'starting'
  | 'live'
  | 'finishing'
  | 'complete'
  | 'error';

export interface InterviewResult {
  graded: boolean;
  scores: TurnScores | null;
  feedback: string | null;
  learnerTurns: number;
}

interface StartResponse {
  success?: boolean;
  error?: string;
  interviewId: number;
  token: string;
  model: string;
  minutes: number;
  interviewer: InterviewerPersona;
  resumed: boolean;
}

export interface UseAiInterview {
  phase: InterviewPhase;
  error: string;
  /** Everything said so far, oldest first. */
  transcript: InterviewTurn[];
  /** The line currently being spoken, before it is committed to the transcript. */
  partial: { speaker: 'examiner' | 'learner'; text: string } | null;
  examinerSpeaking: boolean;
  micLevel: number;
  muted: boolean;
  secondsLeft: number | null;
  result: InterviewResult | null;
  start: () => void;
  finish: () => void;
  toggleMute: () => void;
}

export function useAiInterview(assessmentId: number): UseAiInterview {
  const [phase, setPhase] = useState<InterviewPhase>('idle');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<InterviewTurn[]>([]);
  const [partial, setPartial] = useState<UseAiInterview['partial']>(null);
  const [examinerSpeaking, setExaminerSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<InterviewResult | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const speakerRef = useRef<SpeakerQueue | null>(null);
  const interviewIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const deadlineRef = useRef<number>(0);
  const turnsRef = useRef<InterviewTurn[]>([]);
  const pendingRef = useRef<{ examiner: string; learner: string }>({ examiner: '', learner: '' });
  /** Guards the two paths into finish(): the button and the countdown. */
  const finishingRef = useRef(false);

  /* ── Transcript assembly ─────────────────────────────────────────────
     Live streams transcription in fragments for both sides at once, with no
     turn markers on the input side. A speaker's line is therefore committed
     when the OTHER one starts, which is the only boundary the stream
     actually gives us, plus a flush on `turnComplete` and at the end. */

  const commit = useCallback((speaker: 'examiner' | 'learner') => {
    const text = pendingRef.current[speaker].trim();
    pendingRef.current[speaker] = '';
    if (!text) return;
    turnsRef.current = [
      ...turnsRef.current,
      { speaker, text, at: Math.max(0, Date.now() - startedAtRef.current) },
    ];
    setTranscript(turnsRef.current);
  }, []);

  const append = useCallback(
    (speaker: 'examiner' | 'learner', text: string) => {
      const other = speaker === 'examiner' ? 'learner' : 'examiner';
      if (pendingRef.current[other]) commit(other);
      pendingRef.current[speaker] += text;
      setPartial({ speaker, text: pendingRef.current[speaker] });
    },
    [commit],
  );

  /* ── Teardown ────────────────────────────────────────────────────────
     Always in this order: stop sending, stop playing, close the socket. A
     socket closed first would leave the worklet posting frames into nothing. */

  const teardown = useCallback(async () => {
    await micRef.current?.stop();
    micRef.current = null;
    await speakerRef.current?.close();
    speakerRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      // Already closed by the server — closing twice is not an error worth surfacing.
    }
    sessionRef.current = null;
    setExaminerSpeaking(false);
    setMicLevel(0);
    setSecondsLeft(null);
  }, []);

  /* ── Finishing ───────────────────────────────────────────────────────── */

  const finish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    const interviewId = interviewIdRef.current;
    setPhase('finishing');

    void (async () => {
      commit('learner');
      commit('examiner');
      setPartial(null);
      const turns = turnsRef.current;
      await teardown();

      if (interviewId == null) {
        setPhase('idle');
        finishingRef.current = false;
        return;
      }

      try {
        const res = await fetch(`/api/assessments/${assessmentId}/interview`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ interviewId, transcript: turns }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Your interview could not be submitted.');

        setResult({
          graded: Boolean(data.graded),
          scores: data.scores ?? null,
          feedback: data.feedback ?? null,
          learnerTurns: Number(data.learnerTurns) || 0,
        });
        setPhase('complete');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your interview could not be submitted.');
        setPhase('error');
      } finally {
        finishingRef.current = false;
      }
    })();
  }, [assessmentId, commit, teardown]);

  // Kept in a ref so the message handler and the countdown can call the
  // current `finish` without either being rebuilt when it changes.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  /* ── Starting ────────────────────────────────────────────────────────── */

  const start = useCallback(() => {
    setError('');
    setResult(null);
    setPhase('starting');

    void (async () => {
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/interview`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = (await res.json().catch(() => ({}))) as StartResponse;
        if (!res.ok) throw new Error(data.error ?? 'The examiner could not be reached.');

        interviewIdRef.current = data.interviewId;
        pendingRef.current = { examiner: '', learner: '' };
        setPartial(null);

        // A resumed interview keeps what was already said. The server left the
        // row open precisely so a dropped connection does not cost the
        // learner their attempt, and clearing here would make that hollow —
        // they would keep the attempt and lose the examination.
        if (!data.resumed) {
          turnsRef.current = [];
          setTranscript([]);
        }

        // Unlocked inside the click that started this, before any await that
        // could cost us the gesture: browsers will not start audio otherwise.
        const speaker = new SpeakerQueue(setExaminerSpeaking);
        speakerRef.current = speaker;
        await speaker.unlock();

        const ai = new GoogleGenAI({
          // The ephemeral token stands in for the API key. It carries the
          // examiner's locked brief; it is not, and must never be, the real key.
          apiKey: data.token,
          httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
        });

        const session = await ai.live.connect({
          model: data.model,
          config: {
            // `responseModalities`, `systemInstruction` and the voice are all
            // locked into the token and would be ignored if set here. What is
            // NOT locked, and is the reason this feature can be graded at all,
            // is transcription of both sides.
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              if (!content) return;

              // The learner spoke over the examiner. Anything already
              // scheduled has to go, or it plays over their answer.
              if (content.interrupted) {
                speakerRef.current?.interrupt();
                commit('examiner');
              }

              for (const part of content.modelTurn?.parts ?? []) {
                const inline = part.inlineData;
                if (inline?.data) speakerRef.current?.enqueue(inline.data);
              }

              if (content.outputTranscription?.text) {
                append('examiner', content.outputTranscription.text);
              }
              if (content.inputTranscription?.text) {
                append('learner', content.inputTranscription.text);
              }
              if (content.turnComplete) {
                commit('examiner');
                setPartial(null);
              }
            },
            onerror: (event: ErrorEvent) => {
              setError(
                event?.message
                  ? `The connection to the examiner failed: ${event.message}`
                  : 'The connection to the examiner failed.',
              );
              setPhase('error');
              // Nulled BEFORE teardown so the close it causes is not mistaken
              // for the examiner ending the interview. A dropped connection
              // must not submit a half transcript as a finished examination —
              // the row stays open and "Resume" picks it up where it stopped.
              sessionRef.current = null;
              void teardown();
            },
            onclose: () => {
              // The examiner closing the socket is how a finished interview
              // ends. Submit what was said rather than discarding it.
              if (sessionRef.current) finishRef.current();
            },
          },
        });

        sessionRef.current = session;

        const mic = new MicCapture();
        micRef.current = mic;
        await mic.start({
          onFrame: (base64) => {
            try {
              sessionRef.current?.sendRealtimeInput({
                audio: { data: base64, mimeType: CAPTURE_MIME_TYPE },
              });
            } catch {
              // A frame lost to a socket closing mid-flight is not worth
              // failing the interview over; onclose/onerror handle the rest.
            }
          },
          onLevel: setMicLevel,
        });

        // Kept across a resume so the transcript's offsets stay monotonic.
        if (!data.resumed || startedAtRef.current === 0) startedAtRef.current = Date.now();
        deadlineRef.current = Date.now() + data.minutes * 60_000;
        setSecondsLeft(data.minutes * 60);
        setPhase('live');
      } catch (e) {
        await teardown();
        setError(
          e instanceof Error
            ? e.name === 'NotAllowedError'
              ? 'The examination needs your microphone. Allow it and try again.'
              : e.message
            : 'The examiner could not be reached.',
        );
        setPhase('error');
      }
    })();
  }, [assessmentId, append, commit, teardown]);

  /* ── The clock ───────────────────────────────────────────────────────
     The budget is the tutor's `minutesPerLearner`. It runs out on its own so
     an interview cannot be left open indefinitely against a paid API, and it
     submits rather than discarding — time up is a complete examination. */

  useEffect(() => {
    if (phase !== 'live') return;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) finishRef.current();
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  /* ── Unmount ─────────────────────────────────────────────────────────
     Tears the media down but does NOT submit: a closed tab is an abandoned
     interview, and the server leaves the row resumable so a learner whose
     laptop slept is not charged their one attempt. */

  useEffect(() => () => {
    sessionRef.current = null;
    void teardown();
  }, [teardown]);

  const toggleMute = useCallback(() => {
    setMuted((was) => {
      micRef.current?.setMuted(!was);
      return !was;
    });
  }, []);

  return {
    phase,
    error,
    transcript,
    partial,
    examinerSpeaking,
    micLevel,
    muted,
    secondsLeft,
    result,
    start,
    finish,
    toggleMute,
  };
}
