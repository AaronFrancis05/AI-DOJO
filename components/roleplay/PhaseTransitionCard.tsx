'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { getPhaseMeta, PHASE_ORDER } from '@/lib/roleplay/phase-ui';
import type { PhaseTransitionEvent } from '@/lib/hooks/useRoleplaySession';
import { prefersReducedMotion } from '@/lib/hooks/useCelebrationConfetti';

interface PhaseTransitionCardProps {
  transition: PhaseTransitionEvent | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function PhaseTransitionCard({ transition, onDismiss, autoDismissMs = 3000 }: PhaseTransitionCardProps) {
  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [transition, autoDismissMs, onDismiss]);

  if (!transition) return null;

  const meta = getPhaseMeta(transition.toPhase);
  const Icon = meta.icon;
  const reduced = prefersReducedMotion();

  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center bg-dojo-canvas/80 backdrop-blur-sm px-4 ${reduced ? '' : 'animate-in fade-in duration-200'}`}
      onClick={onDismiss}
      role="button"
      tabIndex={-1}
      aria-label="Dismiss phase transition"
    >
      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-dojo-surface-raised p-6 text-center shadow-2xl ${reduced ? '' : 'animate-in zoom-in-95 duration-300'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${meta.glowClass}`} />

        <button
          type="button"
          onClick={onDismiss}
          className="tap-target absolute right-3 top-3 z-10 text-dojo-text-muted hover:text-dojo-text-primary"
          aria-label="Skip"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${reduced ? '' : 'animate-glow-pulse'}`}
            style={{ backgroundColor: `${meta.hex}26`, boxShadow: `0 0 32px ${meta.hex}40` }}
          >
            <Icon className="h-8 w-8" style={{ color: meta.hex }} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-dojo-text-primary">{meta.title}</h2>
            <p className="mt-1 text-sm text-dojo-text-muted">{meta.description}</p>
          </div>

          <div className="flex items-center gap-2">
            {PHASE_ORDER.map((key) => {
              const stepMeta = getPhaseMeta(key);
              const isCurrent = key === meta.key;
              return (
                <span
                  key={key}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                    isCurrent ? 'text-white border-transparent' : 'border-dojo-border text-dojo-text-muted'
                  }`}
                  style={isCurrent ? { backgroundColor: meta.hex } : undefined}
                >
                  {stepMeta.order}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
