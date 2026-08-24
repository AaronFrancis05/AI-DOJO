'use client';

import { useEffect } from 'react';
import { Crown, ShieldCheck, Flame, Target, MessagesSquare, Mic, Star, PartyPopper, RotateCcw } from 'lucide-react';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { ResultsAvatarBackdrop } from '@/components/roleplay/ResultsAvatarBackdrop';
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
    <div className="fixed inset-0 z-40 overflow-y-auto bg-dojo-canvas">
      <ResultsAvatarBackdrop
        src="/characters/session_phase_avatars/celebration_avatar.png"
        glow="rgba(240,169,59,0.28)"
      />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-10 sm:px-8 lg:px-12">
        <div className="text-center">
          <Crown className={`mx-auto h-8 w-8 text-dojo-streak ${reduced ? '' : 'animate-glow-pulse'}`} />
          <h1
            className="mt-3 text-4xl font-extrabold tracking-tight text-dojo-streak sm:text-5xl"
            style={{ textShadow: '0 0 28px rgba(240,169,59,0.6)' }}
          >
            Lesson Complete!
          </h1>
          <p className="mt-2 text-sm font-semibold text-dojo-text-primary sm:text-base">You did amazing!</p>
          <p className="mt-1 text-xs text-dojo-text-muted">{scenarioTitle}</p>
        </div>

        <div className="mt-8 flex-1 lg:grid lg:grid-cols-[280px_1fr_300px] lg:items-start lg:gap-6">
          <div className="space-y-4 lg:self-start">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dojo-border bg-dojo-surface-raised/85 p-5 text-center shadow-2xl backdrop-blur-md">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dojo-streak/15 ring-1 ring-dojo-streak/30">
                <ShieldCheck className="h-7 w-7 text-dojo-streak" />
              </div>
              <span className="rounded-full bg-dojo-accent px-4 py-1 text-xs font-bold text-white shadow-md">
                Excellent Work!
              </span>
              {typeof xpGained === 'number' && (
                <div className="flex flex-col items-center rounded-xl border border-dojo-border bg-dojo-surface px-6 py-2">
                  <span className="text-lg font-extrabold text-dojo-streak">+{xpGained} XP</span>
                  <span className="text-[10px] text-dojo-text-muted">Experience Earned</span>
                </div>
              )}
            </div>
          </div>

          <div className="hidden lg:block" />

          <div className="mt-6 space-y-4 lg:mt-0 lg:self-start">
            <div className="rounded-2xl border border-dojo-border bg-dojo-surface-raised/85 p-4 shadow-2xl backdrop-blur-md">
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
              <div className="flex items-center gap-2 rounded-xl border border-dojo-streak/30 bg-dojo-streak/10 px-4 py-3 shadow-xl backdrop-blur-md">
                <Flame className="h-5 w-5 text-dojo-streak" />
                <div>
                  <p className="text-sm font-bold text-dojo-text-primary">{newStreak} Day Streak!</p>
                  <p className="text-[11px] text-dojo-text-muted">Keep it up!</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-md text-center text-xs italic text-dojo-text-muted">
          &ldquo;Consistency today, fluency tomorrow.&rdquo; You&apos;re one step closer to your goal!
        </p>

        <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2.5 pb-6 safe-bottom sm:flex-row">
          <button
            type="button"
            onClick={onContinue}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-dojo-accent to-dojo-success py-3 font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
          >
            <PartyPopper className="h-4 w-4" />
            Continue Learning
          </button>
          <button
            type="button"
            onClick={onRepeat}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dojo-border bg-dojo-surface-raised/85 py-2.5 text-sm font-semibold text-dojo-text-primary backdrop-blur-md transition-colors hover:bg-dojo-surface-hover"
          >
            <RotateCcw className="h-4 w-4" />
            Try Another Lesson
          </button>
        </div>
      </div>
    </div>
  );
}
