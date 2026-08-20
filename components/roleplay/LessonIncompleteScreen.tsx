'use client';

import { useEffect, useState } from 'react';
import { Frown, Lightbulb, AlertCircle, XCircle, RotateCcw, ArrowRight, LogOut, Target, MessagesSquare, Mic, Star } from 'lucide-react';
import { prefersReducedMotion } from '@/lib/hooks/useCelebrationConfetti';
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

const BAR_ROWS: Array<{ key: keyof SessionMetrics; label: string; icon: typeof Target; barClass: string; iconClass: string }> = [
  { key: 'accuracy', label: 'Accuracy', icon: Target, barClass: 'bg-dojo-danger', iconClass: 'text-dojo-danger' },
  { key: 'fluency', label: 'Fluency', icon: MessagesSquare, barClass: 'bg-dojo-accent', iconClass: 'text-dojo-accent' },
  { key: 'pronunciation', label: 'Pronunciation', icon: Mic, barClass: 'bg-dojo-evaluation', iconClass: 'text-dojo-evaluation' },
  { key: 'vocabulary', label: 'Vocabulary', icon: Star, barClass: 'bg-dojo-streak', iconClass: 'text-dojo-streak' },
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
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-dojo-canvas">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center 30%, rgba(209,67,67,0.18), transparent 60%)' }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 sm:max-w-lg sm:px-6">
        <div className="flex flex-col items-center text-center">
          <Frown className="h-8 w-8 text-dojo-danger" />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-dojo-danger sm:text-3xl">
            Lesson Incomplete
          </h1>
          <p className="mt-1 text-sm text-dojo-text-muted">Don&apos;t give up! Every mistake is a step to mastery.</p>
          <p className="mt-1 text-xs text-dojo-text-muted/70">{scenarioTitle}</p>
        </div>

        <div className="mt-6 flex items-center justify-center">
          <img
            src="/characters/lesson-incomplete.png"
            alt=""
            className="h-32 w-32 rounded-full object-cover shadow-2xl"
            style={{ boxShadow: '0 0 0 4px rgba(209,67,67,0.5), 0 0 32px rgba(209,67,67,0.3)' }}
          />
        </div>

        <div className="relative mt-4 flex items-center justify-center">
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

        <div className="mt-2 flex items-start gap-2 rounded-xl border border-dojo-border bg-dojo-surface-raised/80 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-dojo-danger mt-0.5" />
          <div>
            <p className="text-sm font-bold text-dojo-text-primary">You&apos;re close!</p>
            <p className="text-xs text-dojo-text-muted">Review the weak areas and try again to improve your score.</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-dojo-border bg-dojo-surface-raised/80 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-dojo-text-muted">Performance Breakdown</p>
          <div className="space-y-3">
            {BAR_ROWS.map(({ key, label, icon: Icon, barClass, iconClass }) => {
              const value = metrics[key];
              if (value === null || value === undefined) return null;
              const pct = Math.max(0, Math.min(100, value as number));
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
                      <span className="text-xs text-dojo-text-primary">{label}</span>
                    </div>
                    <span className="text-xs font-bold text-dojo-text-primary">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-dojo-border/60">
                    <div
                      className={`h-full rounded-full ${barClass} ${reduced ? '' : 'transition-all duration-700 ease-out'}`}
                      style={{ width: `${filled ? pct : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {whatWentWrong.length > 0 && (
          <div className="mt-4 rounded-2xl border border-dojo-border bg-dojo-surface-raised/80 p-4">
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

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-dojo-warning/20 bg-dojo-warning/10 px-4 py-3">
          <Lightbulb className="h-4 w-4 shrink-0 text-dojo-warning" />
          <div>
            <p className="text-sm font-bold text-dojo-text-primary">Mistakes help you grow!</p>
            <p className="text-[11px] text-dojo-text-muted">Review, practice, and you&apos;ll do even better next time.</p>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2.5 pt-6 safe-bottom">
          <button
            type="button"
            onClick={onRepeat}
            className="flex items-center justify-center gap-2 rounded-xl border border-dojo-danger bg-dojo-danger/10 py-3 font-semibold text-dojo-danger transition-colors hover:bg-dojo-danger/20"
          >
            <RotateCcw className="h-4 w-4" />
            Repeat Lesson
            <span className="rounded-full bg-dojo-danger px-2 py-0.5 text-[10px] font-bold text-white">Recommended</span>
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex items-center justify-center gap-2 rounded-xl border border-dojo-border bg-dojo-surface py-2.5 text-sm font-semibold text-dojo-text-primary transition-colors hover:bg-dojo-surface-hover"
          >
            <ArrowRight className="h-4 w-4" />
            Next Lesson
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
          >
            <LogOut className="h-4 w-4" />
            Leave Session
          </button>
        </div>
      </div>
    </div>
  );
}
