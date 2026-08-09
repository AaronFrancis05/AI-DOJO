'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, CheckCircle2, XCircle, ArrowRight, Volume2, RotateCcw, Shuffle } from 'lucide-react';
import { speakWithVisemes, speak as ttsSpeak } from '@/lib/roleplay/tts';
import { getBCP47 } from '@/lib/language';

interface QuickDrillItem {
  id: number;
  domainSlug: string;
  promptJa: string;
  promptPhonetic: string | null;
  promptEn: string;
  expectedGoal: string | null;
  difficulty: string;
  languageCode: string;
}

interface QuickExchangeDrillProps {
  drills: QuickDrillItem[];
  targetLanguage: string;
  nativeLanguage: string;
  characterName: string;
  accentColor: string;
  onComplete: () => void;
  onSubmitResponse: (text: string) => Promise<{ correct: boolean; feedback: string }>;
}

export function QuickExchangeDrill({
  drills,
  targetLanguage,
  characterName,
  accentColor,
  onComplete,
  onSubmitResponse,
}: QuickExchangeDrillProps) {
  const [drillIndex, setDrillIndex] = useState(0);
  const [exchangeStep, setExchangeStep] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'listening' | 'result'>('intro');
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [correct, setCorrect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [responseTime, setResponseTime] = useState(0);
  const bcp47 = getBCP47(targetLanguage, 'tts');
  const exchangeStartRef = useRef<number>(Date.now());

  const currentDrill = drills[drillIndex];

  if (drills.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-dojo-text-muted text-sm">No drills available for this session.</p>
      </div>
    );
  }

  const handlePlayPrompt = useCallback(async () => {
    setBusy(true);
    await ttsSpeak(currentDrill.promptEn, 'en-US');
    await speakWithVisemes(currentDrill.promptJa, bcp47).catch(() => ttsSpeak(currentDrill.promptJa, bcp47));
    setBusy(false);
    exchangeStartRef.current = Date.now();
    setPhase('listening');
  }, [currentDrill, bcp47]);

  const hasAutoPlayed = useRef(false);
  useEffect(() => {
    if (phase === 'intro' && !hasAutoPlayed.current && !busy) {
      hasAutoPlayed.current = true;
      handlePlayPrompt();
    }
    if (phase !== 'intro') hasAutoPlayed.current = false;
  }, [phase, handlePlayPrompt, busy]);

  const handleResponse = useCallback(async () => {
    if (busy) return;
    const input = transcript.trim();
    if (!input) return;
    setBusy(true);
    const elapsed = Date.now() - exchangeStartRef.current;
    setResponseTime(elapsed);

    try {
      const result = await onSubmitResponse(input);
      setCorrect(result.correct);
      setFeedback(result.feedback);
      setPhase('result');
    } catch {
      setCorrect(false);
      setFeedback('Something went wrong. Please try again.');
      setPhase('result');
    } finally {
      setBusy(false);
    }
  }, [transcript, currentDrill, onSubmitResponse, busy]);

  const handleNext = useCallback(() => {
    if (drillIndex + 1 >= drills.length) {
      onComplete();
    } else {
      setDrillIndex(i => i + 1);
    }
  }, [drillIndex, drills.length, onComplete]);

  const handleRetry = useCallback(() => {
    setPhase('intro');
    setTranscript('');
    setFeedback('');
    setCorrect(false);
  }, []);

  const handleShuffle = useCallback(() => {
    const next = Math.floor(Math.random() * drills.length);
    setDrillIndex(next);
  }, [drills.length]);

  const totalExchanges = drills.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-dojo-text-muted">
              Drill {drillIndex + 1} of {totalExchanges}
            </span>
            <div className="flex-1 h-1 rounded-full bg-dojo-border overflow-hidden min-w-[60px]">
              <div
                className="h-full rounded-full bg-dojo-accent transition-all duration-300"
                style={{ width: `${((drillIndex + 1) / totalExchanges) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleShuffle}
            className="flex items-center gap-1 text-xs text-dojo-text-muted hover:text-dojo-accent transition-colors"
          >
            <Shuffle className="h-3 w-3" /> Shuffle
          </button>
        </div>

        {/* Main card */}
        <div className="rounded-xl border border-dojo-border bg-dojo-surface-raised/80 p-6 text-center">
          {/* AI Character prompt */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {characterName.charAt(0)}
            </div>
            <span className="text-sm font-medium text-dojo-text-primary">{characterName}</span>
          </div>

          <div className="rounded-xl bg-dojo-surface p-4 mb-6 text-left">
            <p className="text-sm text-dojo-text-primary">{currentDrill.promptJa}</p>
            {currentDrill.promptPhonetic && (
              <p className="text-xs text-dojo-text-muted italic mt-1">{currentDrill.promptPhonetic}</p>
            )}
            <p className="text-xs text-dojo-text-muted mt-1">{currentDrill.promptEn}</p>
          </div>

          {phase === 'listening' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handlePlayPrompt}
                  className="flex items-center gap-2 text-xs text-dojo-accent hover:underline"
                >
                  <Volume2 className="h-3 w-3" /> Hear it again
                </button>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleResponse}
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
                  {busy ? 'Processing...' : 'Respond'}
                </span>
              </div>
            </div>
          )}

          {phase === 'result' && (
            <div className="space-y-4">
              {correct ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 className="h-12 w-12 text-dojo-success" />
                  <p className="text-lg font-semibold text-dojo-success">Great response!</p>
                  <p className="text-xs text-dojo-text-muted">
                    Response time: {responseTime < 1000 ? `${responseTime}ms` : `${(responseTime / 1000).toFixed(1)}s`}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <XCircle className="h-12 w-12 text-dojo-warning" />
                  <p className="text-lg font-semibold text-dojo-warning">Keep practicing</p>
                  <p className="text-sm text-dojo-text-muted">{feedback}</p>
                  <p className="text-xs text-dojo-text-muted">
                    Response time: {responseTime < 1000 ? `${responseTime}ms` : `${(responseTime / 1000).toFixed(1)}s`}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-2 rounded-full border border-dojo-border px-4 py-2 text-xs text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 rounded-full bg-dojo-accent px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  {drillIndex + 1 >= totalExchanges ? 'Done' : 'Next'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
