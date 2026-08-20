'use client';

import { useEffect } from 'react';
import { CheckCircle, Sparkles, Zap, X } from 'lucide-react';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';

// 'scenario-mastery' and 'needs-practice' are handled by the dedicated
// LessonCompleteScreen / LessonIncompleteScreen full-screen results instead.
export type CelebrationVariant = 'goal-complete' | 'level-up' | 'achievement-unlock';

interface CelebrationOverlayProps {
  variant: CelebrationVariant;
  title: string;
  subtitle?: string;
  onDismiss: () => void;
  onRepeat?: () => void;
  autoDismissMs?: number;
}

const variantIcons = {
  'goal-complete': CheckCircle,
  'level-up': Zap,
  'achievement-unlock': Sparkles,
};

export function CelebrationOverlay({ variant, title, subtitle, onDismiss, onRepeat, autoDismissMs }: CelebrationOverlayProps) {
  const { fireBurst } = useCelebrationConfetti();

  useEffect(() => {
    fireBurst(variant === 'level-up' ? 'full' : 'toast');

    if (autoDismissMs) {
      const t = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(t);
    }
  }, [variant, autoDismissMs, onDismiss, fireBurst]);

  const isModal = variant === 'level-up';
  const Icon = variantIcons[variant] ?? Sparkles;

  if (isModal) {
    const iconBg = 'bg-gradient-to-br from-dojo-accent to-dojo-success';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-sm rounded-2xl border border-dojo-border bg-dojo-surface-raised p-8 shadow-2xl text-center animate-in zoom-in-95 duration-200">
          <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${iconBg} shadow-lg`}>
            <Icon className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-dojo-text-primary">{title}</h2>
          {subtitle && <p className="mt-2 text-sm text-dojo-text-muted">{subtitle}</p>}
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={onDismiss}
              className="w-full rounded-xl bg-dojo-accent py-3 font-semibold text-white transition-opacity hover:opacity-90"
            >
              Continue
            </button>
            {onRepeat && (
              <button
                onClick={onRepeat}
                className="w-full rounded-xl border border-dojo-border bg-dojo-surface py-2.5 text-sm font-semibold text-dojo-text-primary transition-colors hover:bg-dojo-surface-hover"
              >
                Repeat Session
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-2 fade-in duration-200">
      <div className="flex items-start gap-3 rounded-xl border border-dojo-border bg-dojo-surface-raised p-4 shadow-2xl max-w-xs">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dojo-success/20">
          <Icon className="h-4 w-4 text-dojo-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-dojo-text-primary">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-dojo-text-muted">{subtitle}</p>}
        </div>
        <button onClick={onDismiss} className="shrink-0 text-dojo-text-muted hover:text-dojo-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
