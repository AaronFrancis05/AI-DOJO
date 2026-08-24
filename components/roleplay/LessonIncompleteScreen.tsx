'use client';

import { useEffect, useState } from 'react';
import { Frown, Lightbulb, AlertCircle, XCircle, RotateCcw, ArrowRight, LogOut, Target, MessagesSquare, Mic, Star, Heart } from 'lucide-react';
import { prefersReducedMotion } from '@/lib/hooks/useCelebrationConfetti';
import { ResultsAvatarBackdrop } from '@/components/roleplay/ResultsAvatarBackdrop';
import type { SessionMetrics } from '@/lib/roleplay/session-metrics';

interface LessonIncompleteScreenProps {
  scenarioTitle: string;
  compositeScore: number;
  metrics: SessionMetrics;
  whatWentWrong: string[];
  onRepeat: () => void;
  onNext: () => void;
  onLeave: () => void;
}

const BAR_ROWS: Array<{ key: keyof SessionMetrics; label: string; icon: typeof Target; barClass: string; iconClass: string; iconBgClass: string }> = [
  { key: 'accuracy', label: 'Accuracy', icon: Target, barClass: 'bg-dojo-danger', iconClass: 'text-dojo-danger', iconBgClass: 'bg-dojo-danger/15' },
  { key: 'fluency', label: 'Fluency', icon: MessagesSquare, barClass: 'bg-dojo-accent', iconClass: 'text-dojo-accent', iconBgClass: 'bg-dojo-accent/15' },
  { key: 'pronunciation', label: 'Pronunciation', icon: Mic, barClass: 'bg-dojo-evaluation', iconClass: 'text-dojo-evaluation', iconBgClass: 'bg-dojo-evaluation/15' },
  { key: 'vocabulary', label: 'Vocabulary', icon: Star, barClass: 'bg-dojo-streak', iconClass: 'text-dojo-streak', iconBgClass: 'bg-dojo-streak/15' },
];

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function scoreTier(score: number): string {
  return score < 40 ? 'Needs Practice' : 'Needs Improvement';
}

export function LessonIncompleteScreen({ scenarioTitle, compositeScore, metrics, whatWentWrong, onRepeat, onNext, onLeave }: LessonIncompleteScreenProps) {
  const reduced = prefersReducedMotion();
  const [filled, setFilled] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const targetOffset = RING_CIRCUMFERENCE * (1 - compositeScore / 100);
  const dashoffset = filled ? targetOffset : RING_CIRCUMFERENCE;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-dojo-canvas">
      <ResultsAvatarBackdrop src="/characters/lesson-incomplete.png" glow="rgba(209,67,67,0.26)" fit="portrait" />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-10 sm:px-8 lg:px-12">
        <div className="text-center">
          <Frown className="mx-auto h-8 w-8 text-dojo-danger" />
          <h1
            className="mt-3 text-4xl font-extrabold tracking-tight text-dojo-danger sm:text-5xl"
            style={{ textShadow: '0 0 24px rgba(209,67,67,0.55)' }}
          >
            Lesson Incomplete
          </h1>
          <p className="mt-2 text-sm text-dojo-text-primary/90 sm:text-base">
            Don&apos;t give up! Every mistake is a step to mastery.
          </p>
          <p className="mt-1 text-xs text-dojo-text-muted">{scenarioTitle}</p>
        </div>

        <div className="mt-8 flex-1 lg:grid lg:grid-cols-[300px_1fr_320px] lg:items-start lg:gap-6">
          <div className="space-y-4 lg:self-start">
            <div className="rounded-2xl border border-dojo-border bg-dojo-surface-raised/85 p-5 text-center shadow-2xl backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-wider text-dojo-text-muted">Overall Score</p>
              <div className="relative mx-auto mt-3 flex items-center justify-center">
                <svg width="140" height="140" viewBox="0 0 120 120" className="-rotate-90">
                  <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="var(--color-border)" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r={RING_RADIUS} fill="none"
                    stroke="var(--color-danger)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={dashoffset}
                    className={reduced ? '' : 'animate-ring-fill'}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold text-dojo-danger">{compositeScore}%</span>
                  <span className="text-[11px] font-medium text-dojo-text-muted">{scoreTier(compositeScore)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-dojo-border bg-dojo-surface-raised/85 px-4 py-3 shadow-xl backdrop-blur-md">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dojo-danger" />
              <div>
                <p className="text-sm font-bold text-dojo-text-primary">You&apos;re close!</p>
                <p className="text-xs text-dojo-text-muted">Review the weak areas and try again to improve your score.</p>
              </div>
            </div>
          </div>

          <div className="hidden lg:block" />

          <div className="mt-6 space-y-4 lg:mt-0 lg:self-start">
            <div className="rounded-2xl border border-dojo-border bg-dojo-surface-raised/85 p-4 shadow-2xl backdrop-blur-md">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-dojo-text-muted">Performance Breakdown</p>
              <div className="space-y-3">
                {BAR_ROWS.map(({ key, label, icon: Icon, barClass, iconClass, iconBgClass }) => {
                  const value = metrics[key];
                  if (value === null || value === undefined) return null;
                  const pct = Math.max(0, Math.min(100, value as number));
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBgClass}`}>
                        <Icon className={`h-4 w-4 ${iconClass}`} />
                      </div>
                      <div className="flex-1">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-dojo-text-primary">{label}</span>
                          <span className="text-xs font-bold text-dojo-text-primary">{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-dojo-border/60">
                          <div
                            className={`h-full rounded-full ${barClass} ${reduced ? '' : 'transition-all duration-700 ease-out'}`}
                            style={{ width: `${filled ? pct : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {whatWentWrong.length > 0 && (
              <div className="rounded-2xl border border-dojo-border bg-dojo-surface-raised/85 p-4 shadow-2xl backdrop-blur-md">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-dojo-text-muted">What went wrong?</p>
                <ul className="space-y-1.5">
                  {whatWentWrong.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-dojo-text-primary">
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-dojo-danger" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto mt-6 flex w-full max-w-md items-center gap-2 rounded-xl border border-dojo-warning/20 bg-dojo-warning/10 px-4 py-3 shadow-xl backdrop-blur-md">
          <Lightbulb className="h-4 w-4 shrink-0 text-dojo-warning" />
          <div>
            <p className="text-sm font-bold text-dojo-text-primary">Mistakes help you grow!</p>
            <p className="text-[11px] text-dojo-text-muted">Review, practice, and you&apos;ll do even better next time.</p>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-dojo-border/50" />
            <p className="shrink-0 text-xs text-dojo-text-muted">What would you like to do?</p>
            <div className="h-px flex-1 bg-dojo-border/50" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onRepeat}
              className="flex flex-col items-center gap-1 rounded-xl border border-dojo-danger bg-dojo-danger/10 px-4 py-3 text-center transition-colors hover:bg-dojo-danger/20"
            >
              <span className="flex items-center gap-2 font-semibold text-dojo-danger">
                <RotateCcw className="h-4 w-4" />
                Repeat Lesson
                <span className="rounded-full bg-dojo-danger px-2 py-0.5 text-[10px] font-bold text-white">Recommended</span>
              </span>
              <span className="text-[11px] text-dojo-text-muted">Review and try again</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex flex-col items-center gap-1 rounded-xl border border-dojo-border bg-dojo-surface-raised/85 px-4 py-3 text-center backdrop-blur-md transition-colors hover:bg-dojo-surface-hover"
            >
              <span className="flex items-center gap-2 font-semibold text-dojo-text-primary">
                <ArrowRight className="h-4 w-4" />
                Next Lesson
              </span>
              <span className="text-[11px] text-dojo-text-muted">Continue to the next lesson</span>
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="flex flex-col items-center gap-1 rounded-xl border border-dojo-border bg-dojo-surface-raised/85 px-4 py-3 text-center backdrop-blur-md transition-colors hover:bg-dojo-surface-hover"
            >
              <span className="flex items-center gap-2 font-semibold text-dojo-text-primary">
                <LogOut className="h-4 w-4" />
                Leave Session
              </span>
              <span className="text-[11px] text-dojo-text-muted">End and exit for now</span>
            </button>
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 pb-6 text-center text-xs text-dojo-text-muted safe-bottom">
          <Heart className="h-3.5 w-3.5 text-dojo-danger" />
          Tip: You can always revisit this lesson from your progress dashboard.
        </p>
      </div>
    </div>
  );
}
