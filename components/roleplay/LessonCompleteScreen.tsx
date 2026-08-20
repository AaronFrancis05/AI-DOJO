'use client';

import { useEffect } from 'react';
import { Crown, ShieldCheck, Flame, Target, MessagesSquare, Mic, Star, PartyPopper, RotateCcw } from 'lucide-react';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { qualitativeTag, type SessionMetrics } from '@/lib/roleplay/session-metrics';

interface LessonCompleteScreenProps {
  scenarioTitle: string;
  metrics: SessionMetrics;
  xpGained?: number;
  newStreak?: number;
  onContinue: () => void;
  onRepeat: () => void;
}

const METRIC_ROWS: Array<{ key: keyof SessionMetrics; label: string; icon: typeof Target; iconClass: string; iconBgClass: string }> = [
  { key: 'accuracy', label: 'Accuracy', icon: Target, iconClass: 'text-dojo-danger', iconBgClass: 'bg-dojo-danger/15' },
  { key: 'fluency', label: 'Fluency', icon: MessagesSquare, iconClass: 'text-dojo-accent', iconBgClass: 'bg-dojo-accent/15' },
  { key: 'pronunciation', label: 'Pronunciation', icon: Mic, iconClass: 'text-dojo-evaluation', iconBgClass: 'bg-dojo-evaluation/15' },
  { key: 'vocabulary', label: 'Vocabulary', icon: Star, iconClass: 'text-dojo-streak', iconBgClass: 'bg-dojo-streak/15' },
];

export function LessonCompleteScreen({ scenarioTitle, metrics, xpGained, newStreak, onContinue, onRepeat }: LessonCompleteScreenProps) {
  const { fireBurst, prefersReducedMotion } = useCelebrationConfetti();
  const reduced = prefersReducedMotion();

  useEffect(() => {
    fireBurst('full');
  }, [fireBurst]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-dojo-canvas">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center 35%, rgba(240,169,59,0.22), transparent 60%)' }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 sm:max-w-lg sm:px-6">
        <div className="flex flex-col items-center text-center">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-dojo-streak/20 ${reduced ? '' : 'animate-glow-pulse'}`}>
            <Crown className="h-7 w-7 text-dojo-streak" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-dojo-text-primary sm:text-3xl">
            Lesson Complete!
          </h1>
          <p className="mt-1 text-sm font-semibold text-dojo-streak">You did amazing!</p>
          <p className="mt-1 text-xs text-dojo-text-muted">{scenarioTitle}</p>
        </div>

        <div className="relative mt-6 flex items-center justify-center">
          <img
            src="/characters/lesson-complete.png"
            alt=""
            className={`h-36 w-36 rounded-full object-cover shadow-2xl ${reduced ? '' : 'animate-glow-pulse'}`}
            style={{ boxShadow: '0 0 0 4px rgba(240,169,59,0.5), 0 0 40px rgba(240,169,59,0.35)' }}
          />
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dojo-streak/15 ring-1 ring-dojo-streak/30">
              <ShieldCheck className="h-7 w-7 text-dojo-streak" />
            </div>
            <span className="rounded-full bg-dojo-accent px-4 py-1 text-xs font-bold text-white shadow-md">
              Excellent Work!
            </span>
          </div>
          {typeof xpGained === 'number' && (
            <div className="flex flex-col items-center rounded-xl border border-dojo-border bg-dojo-surface-raised px-6 py-2">
              <span className="text-lg font-extrabold text-dojo-streak">+{xpGained} XP</span>
              <span className="text-[10px] text-dojo-text-muted">Experience Earned</span>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-dojo-border bg-dojo-surface-raised/80 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-dojo-text-muted">Your Performance</p>
          <div className="space-y-3">
            {METRIC_ROWS.map(({ key, label, icon: Icon, iconClass, iconBgClass }) => {
              const value = metrics[key];
              if (value === null || value === undefined) return null;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBgClass}`}>
                    <Icon className={`h-4 w-4 ${iconClass}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-dojo-text-muted">{label}</p>
                    <p className="text-base font-bold text-dojo-success">{value}%</p>
                  </div>
                  <span className="rounded-full bg-dojo-success/15 px-2.5 py-1 text-[11px] font-semibold text-dojo-success">
                    {qualitativeTag(value as number)}
                  </span>
                </div>
              );
            })}
            {typeof metrics.newWordsCount === 'number' && (
              <div className="flex items-center gap-3 border-t border-dojo-border/50 pt-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dojo-streak/15">
                  <Star className="h-4 w-4 text-dojo-streak" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-dojo-text-muted">New Words</p>
                  <p className="text-base font-bold text-dojo-text-primary">{metrics.newWordsCount}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {typeof newStreak === 'number' && newStreak > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-dojo-streak/30 bg-dojo-streak/10 px-4 py-3">
            <Flame className="h-5 w-5 text-dojo-streak" />
            <div>
              <p className="text-sm font-bold text-dojo-text-primary">{newStreak} Day Streak!</p>
              <p className="text-[11px] text-dojo-text-muted">Keep it up!</p>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-xs italic text-dojo-text-muted">
          &ldquo;Consistency today, fluency tomorrow.&rdquo; You&apos;re one step closer to your goal!
        </p>

        <div className="mt-auto flex flex-col gap-2.5 pt-6 safe-bottom">
          <button
            type="button"
            onClick={onContinue}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-dojo-accent to-dojo-success py-3 font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
          >
            <PartyPopper className="h-4 w-4" />
            Continue Learning
          </button>
          <button
            type="button"
            onClick={onRepeat}
            className="flex items-center justify-center gap-2 rounded-xl border border-dojo-border bg-dojo-surface py-2.5 text-sm font-semibold text-dojo-text-primary transition-colors hover:bg-dojo-surface-hover"
          >
            <RotateCcw className="h-4 w-4" />
            Try Another Lesson
          </button>
        </div>
      </div>
    </div>
  );
}
