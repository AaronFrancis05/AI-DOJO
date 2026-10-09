'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, ArrowRight, Volume2, RotateCcw, Shuffle, Send } from 'lucide-react';
import { speakWithVisemes, speak as ttsSpeak, setVoiceGender } from '@/lib/roleplay/tts';
import { getBCP47 } from '@/lib/language';

/**
 * One prompt-and-answer exchange. Field names follow the `quick_drills`
 * table; a study pack maps its dialogue lines onto the same shape
 * (components/study-packs/DialoguePractice.tsx). `promptJa` is the prompt in
 * the target language whatever that language is, and `promptEn` its gloss in
 * the learner's own language.
 */
export interface QuickDrillItem {
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
  characterName: string;
  accentColor: string;
  voiceGender?: string | null;
  onComplete: () => void;
  onSubmitResponse: (text: string, drill: QuickDrillItem) => Promise<{ correct: boolean; feedback: string }>;
}

export function QuickExchangeDrill({
  drills,
  targetLanguage,
  characterName,
  accentColor,
  voiceGender,
  onComplete,
  onSubmitResponse,
}: QuickExchangeDrillProps) {
  const [drillIndex, setDrillIndex] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'listening' | 'result'>('intro');
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [correct, setCorrect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [responseTime, setResponseTime] = useState(0);
  const bcp47 = getBCP47(targetLanguage, 'tts');
  const exchangeStartRef = useRef<number | null>(null);
  const hasAutoPlayed = useRef(false);

  const currentDrill = drills[drillIndex];

  useEffect(() => {
    if (voiceGender) setVoiceGender(voiceGender);
  }, [voiceGender]);

  // Only the target-language prompt is spoken. The gloss is in the learner's
  // own language and is read, not voiced in a target-language voice.
  const handlePlayPrompt = useCallback(async () => {
    if (!currentDrill) return;

    setBusy(true);
    try {
      await speakWithVisemes(currentDrill.promptJa, bcp47).catch(() => ttsSpeak(currentDrill.promptJa, bcp47));
    } catch {
      // Keep the drill usable when audio playback fails.
    } finally {
      exchangeStartRef.current = Date.now();
      setBusy(false);
      setPhase('listening');
    }
  }, [currentDrill, bcp47]);

  useEffect(() => {
    if (phase !== 'intro') {
      hasAutoPlayed.current = false;
      return;
    }
    if (!currentDrill || hasAutoPlayed.current || busy) return;

    hasAutoPlayed.current = true;
    void handlePlayPrompt();
  }, [currentDrill, phase, handlePlayPrompt, busy]);

  const handleResponse = useCallback(async () => {
    if (busy || !currentDrill) return;
    const input = transcript.trim();
    if (!input) return;
    setBusy(true);
    const elapsed = exchangeStartRef.current === null ? 0 : Date.now() - exchangeStartRef.current;
    setResponseTime(elapsed);

    try {
      const result = await onSubmitResponse(input, currentDrill);
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
  }, [transcript, onSubmitResponse, busy, currentDrill]);

  const resetExchange = useCallback(() => {
    setPhase('intro');
    setTranscript('');
    setFeedback('');
    setCorrect(false);
  }, []);

  const handleNext = useCallback(() => {
    if (drillIndex + 1 >= drills.length) {
      onComplete();
    } else {
      setDrillIndex(i => i + 1);
      resetExchange();
    }
  }, [drillIndex, drills.length, onComplete, resetExchange]);

  const handleShuffle = useCallback(() => {
    const next = Math.floor(Math.random() * drills.length);
    setDrillIndex(next);
    resetExchange();
  }, [drills.length, resetExchange]);

  const totalExchanges = drills.length;

  if (!currentDrill) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-dojo-text-muted text-sm">No drills available for this session.</p>
      </div>
    );
  }

  const formattedTime = responseTime < 1000 ? `${responseTime}ms` : `${(responseTime / 1000).toFixed(1)}s`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-dojo-text-muted">
              Drill {drillIndex + 1} of {totalExchanges}
            </span>
            <div className="flex-1 h-1 rounded-full bg-dojo-border overflow-hidden min-w-16">
              <div
                className="h-full rounded-full bg-dojo-accent transition-all duration-300"
                style={{ width: `${((drillIndex + 1) / totalExchanges) * 100}%` }}
              />
            </div>
          </div>
          {totalExchanges > 1 && (
            <button
              onClick={handleShuffle}
              className="flex items-center gap-1 text-xs text-dojo-text-muted hover:text-dojo-accent transition-colors"
            >
              <Shuffle className="h-3 w-3" /> Shuffle
            </button>
          )}
        </div>

        {/* Main card */}
        <div className="rounded-xl border border-dojo-border bg-dojo-surface-raised p-6 text-center">
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

          <div className="rounded-xl bg-dojo-surface p-4 mb-6 text-start">
            <p translate="no" className="text-base text-dojo-text-primary leading-relaxed">{currentDrill.promptJa}</p>
            {currentDrill.promptPhonetic && (
              <p translate="no" className="text-sm text-dojo-text-muted italic mt-1 leading-relaxed">{currentDrill.promptPhonetic}</p>
            )}
            <p className="text-sm text-dojo-text-muted mt-1 leading-relaxed">{currentDrill.promptEn}</p>
          </div>

          {phase === 'listening' && (
            <div className="space-y-4">
              <button
                onClick={handlePlayPrompt}
                className="mx-auto flex items-center gap-2 text-xs text-dojo-accent hover:underline"
              >
                <Volume2 className="h-3 w-3" /> Hear it again
              </button>

              <form
                className="flex items-center gap-2 rounded-xl border border-dojo-border bg-dojo-surface px-3 py-1 transition-colors focus-within:border-dojo-accent"
                onSubmit={(e) => { e.preventDefault(); void handleResponse(); }}
              >
                <input
                  type="text"
                  translate="no"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Type your reply…"
                  aria-label="Your reply"
                  autoFocus
                  disabled={busy}
                  className="flex-1 border-none bg-transparent px-1 py-2 text-base text-dojo-text-primary outline-none placeholder:text-dojo-text-muted"
                />
                <button
                  type="submit"
                  disabled={busy || !transcript.trim()}
                  aria-label="Check reply"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dojo-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}

          {phase === 'result' && (
            <div className="space-y-4">
              {correct ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 className="h-12 w-12 text-dojo-success" />
                  <p className="text-lg font-semibold text-dojo-success">Great response!</p>
                  {feedback && <p translate="no" className="text-sm text-dojo-text-muted">{feedback}</p>}
                  <p className="text-xs text-dojo-text-muted">Response time: {formattedTime}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <XCircle className="h-12 w-12 text-dojo-warning" />
                  <p className="text-lg font-semibold text-dojo-warning">Keep practicing</p>
                  <p translate="no" className="text-sm text-dojo-text-muted">{feedback}</p>
                  <p className="text-xs text-dojo-text-muted">Response time: {formattedTime}</p>
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={resetExchange}
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
