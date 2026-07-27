'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle, Trophy, Sparkles, Zap, X } from 'lucide-react';

export type CelebrationVariant = 'scenario-mastery' | 'goal-complete' | 'level-up' | 'achievement-unlock';

interface CelebrationOverlayProps {
  variant: CelebrationVariant;
  title: string;
  subtitle?: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const variantIcons = {
  'scenario-mastery': Trophy,
  'goal-complete': CheckCircle,
  'level-up': Zap,
  'achievement-unlock': Sparkles,
};

export function CelebrationOverlay({ variant, title, subtitle, onDismiss, autoDismissMs }: CelebrationOverlayProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const isFull = variant === 'scenario-mastery' || variant === 'level-up';
    if (isFull) {
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.4 }, colors: ['#F2A93B', '#4FD1C5', '#8FE2B5'] });
    } else {
      confetti({ particleCount: 40, spread: 55, origin: { y: 0.3 }, scalar: 0.7, colors: ['#4FD1C5', '#8FE2B5'] });
    }

    if (autoDismissMs) {
      const t = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(t);
    }
  }, [variant, autoDismissMs, onDismiss]);

  const isModal = variant === 'scenario-mastery' || variant === 'level-up';
  const Icon = variantIcons[variant];

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-sm rounded-2xl border border-dojo-border bg-dojo-surface-raised p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-dojo-accent to-dojo-success">
            <Icon className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-dojo-text-primary">{title}</h2>
          {subtitle && <p className="mt-2 text-sm text-dojo-text-muted">{subtitle}</p>}
          <button
            onClick={onDismiss}
            className="mt-6 w-full rounded-xl bg-dojo-accent py-3 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Continue
          </button>
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
