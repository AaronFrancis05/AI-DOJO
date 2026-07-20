'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, CheckCircle2, XCircle, ArrowRight, Volume2 } from 'lucide-react';
import { speakWithVisemes, speak as ttsSpeak } from '@/lib/roleplay/tts';
import { getBCP47 } from '@/lib/language';

interface VocabWord {
  id: number;
  japanese: string;
  romaji: string;
  english: string;
  usageTip?: string | null;
}

interface IcebreakerDrillProps {
  word: VocabWord;
  wordIndex: number;
  vocabCount: number;
  targetLanguage: string;
  onAttempt: (vocabularyId: number, transcript: string, accuracyScore: number, attemptNumber: number) => Promise<{
    retry?: boolean;
    feedback?: string;
    attemptNumber?: number;
  }>;
  onComplete: () => void;
}

export function IcebreakerDrill({
  word, wordIndex, vocabCount, targetLanguage,
  onAttempt, onComplete,
}: IcebreakerDrillProps) {
  const [phase, setPhase] = useState<'intro' | 'recording' | 'result' | 'retry'>('intro');
  const [transcript, setTranscript] = useState('');
  const [accuracy, setAccuracy] = useState(0);
  const [passed, setPassed] = useState(false);
  const [attemptNo, setAttemptNo] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const bcp47 = getBCP47(targetLanguage, 'tts');

  useEffect(() => {
    setPhase('intro');
    setAttemptNo(1);
    setTranscript('');
    setAccuracy(0);
    setPassed(false);
    setFeedback('');
  }, [word.id]);

  const handlePlayIntro = useCallback(async () => {
    setBusy(true);
    const intro = `Let's learn the word for "${word.english}". In ${targetLanguage === 'ja' ? 'Japanese' : 'the target language'}, you say:`;
    await ttsSpeak(intro, 'en-US');
    await speakWithVisemes(word.japanese, bcp47).catch(() => ttsSpeak(word.japanese, bcp47));
    setBusy(false);
    setPhase('recording');
  }, [word, bcp47, targetLanguage]);

  const hasAutoPlayed = useRef(false);
  useEffect(() => {
    if (phase === 'intro' && !hasAutoPlayed.current && !busy) {
      hasAutoPlayed.current = true;
      handlePlayIntro();
    }
    if (phase !== 'intro') hasAutoPlayed.current = false;
  }, [phase, handlePlayIntro, busy]);

  const handlePlayWord = useCallback(async () => {
    await speakWithVisemes(word.japanese, bcp47).catch(() => ttsSpeak(word.japanese, bcp47));
  }, [word.japanese, bcp47]);

  const handleRecord = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setPhase('recording');

    try {
      const res = await onAttempt(word.id, transcript || word.japanese, accuracy || 0, attemptNo);
      if (res.retry) {
        setFeedback(res.feedback ?? '');
        setAttemptNo(res.attemptNumber ?? 2);
        setPhase('retry');
      } else {
        setPassed(true);
        setPhase('result');
      }
    } catch {
      setFeedback('Something went wrong. Please try again.');
      setPhase('retry');
    } finally {
      setBusy(false);
    }
  }, [word.id, transcript, accuracy, attemptNo, onAttempt]);

  const handleNext = useCallback(() => {
    if (wordIndex + 1 >= vocabCount) {
      onComplete();
    } else {
      setPhase('intro');
    }
  }, [wordIndex, vocabCount, onComplete]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Progress indicator */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-medium text-dojo-text-muted">
            Word {wordIndex + 1} of {vocabCount}
          </span>
          <div className="flex-1 h-1 rounded-full bg-dojo-border overflow-hidden">
            <div
              className="h-full rounded-full bg-dojo-accent transition-all duration-300"
              style={{ width: `${((wordIndex + 1) / vocabCount) * 100}%` }}
            />
          </div>
        </div>

        {/* Main card */}
        <div className="rounded-xl border border-dojo-border bg-dojo-surface-raised/80 p-6 text-center">
          {phase === 'intro' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <p className="text-xs text-dojo-text-muted uppercase tracking-wider font-medium">
                  New vocabulary
                </p>
                <p className="text-sm text-dojo-text-muted">
                  In English (your language):
                </p>
                <p className="text-xl font-bold text-dojo-text-primary">
                  {word.english}
                </p>
              </div>

              <div className="border-t border-dojo-border/40 pt-4 space-y-2">
                <p className="text-xs text-dojo-text-muted uppercase tracking-wider font-medium">
                  In {targetLanguage === 'ja' ? 'Japanese' : 'the target language'}
                </p>
                <p className="text-2xl font-bold text-dojo-text-primary">
                  {word.japanese}
                </p>
                {word.romaji && (
                  <p className="text-sm text-dojo-text-muted italic">
                    {word.romaji}
                  </p>
                )}
              </div>

              {word.usageTip && (
                <p className="text-xs text-dojo-text-muted/70 bg-dojo-surface rounded-lg px-3 py-2">
                  {word.usageTip}
                </p>
              )}

              <div className="space-y-2 pt-1">
                <button
                  onClick={handlePlayIntro}
                  disabled={busy}
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dojo-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Volume2 className="h-6 w-6" />
                </button>
                <p className="text-xs text-dojo-text-muted">
                  {busy ? 'Playing...' : 'Tap to hear pronunciation'}
                </p>
              </div>
            </div>
          )}

          {(phase === 'recording' || phase === 'retry') && (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-2xl font-bold text-dojo-text-primary">{word.japanese}</p>
                <p className="text-sm text-dojo-text-muted italic">{word.romaji}</p>
                <p className="text-xs text-dojo-text-muted">({word.english})</p>
                {word.usageTip && (
                  <p className="text-xs text-dojo-text-muted/70 mt-2">{word.usageTip}</p>
                )}
              </div>

              <button
                onClick={handlePlayWord}
                className="mx-auto flex items-center gap-2 text-xs text-dojo-accent hover:underline"
              >
                <Volume2 className="h-3 w-3" /> Hear it again
              </button>

              {phase === 'retry' && feedback && (
                <p className="text-sm text-dojo-warning bg-dojo-warning/10 rounded-lg px-3 py-2">{feedback}</p>
              )}

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleRecord}
                  disabled={busy}
                  className={`flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 ${
                    busy
                      ? 'bg-dojo-danger scale-110 shadow-[0_0_30px_rgba(209,67,67,0.6)]'
                      : 'bg-dojo-accent hover:scale-105 shadow-[0_10px_25px_rgba(45,59,197,0.5)]'
                  } disabled:opacity-40`}
                >
                  <Mic className="h-8 w-8 text-white" />
                </button>
                <span className="text-[10px] font-bold uppercase tracking-widest text-dojo-text-muted">
                  {busy ? 'Listening...' : phase === 'retry' ? 'Try Again' : 'Tap & Say the Word'}
                </span>
              </div>
            </div>
          )}

          {phase === 'result' && (
            <div className="space-y-4">
              {passed ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 className="h-12 w-12 text-dojo-success" />
                  <p className="text-lg font-semibold text-dojo-success">Great job!</p>
                  <p className="text-sm text-dojo-text-muted">
                    You said: <span className="text-dojo-text-primary font-medium">{word.japanese}</span>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <XCircle className="h-12 w-12 text-dojo-warning" />
                  <p className="text-lg font-semibold text-dojo-warning">Keep practicing</p>
                  <p className="text-sm text-dojo-text-muted">
                    The word is: <span className="text-dojo-text-primary font-medium">{word.japanese}</span>
                    <br />
                    <span className="italic">{word.romaji}</span>
                  </p>
                </div>
              )}
              <button
                onClick={handleNext}
                className="mx-auto flex items-center gap-2 rounded-full bg-dojo-accent px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                {wordIndex + 1 >= vocabCount ? 'Start Roleplay' : 'Next Word'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}