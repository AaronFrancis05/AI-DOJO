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
          <div className={`relative h-24 w-24 rounded-full ${reduced ? '' : 'animate-glow-pulse'}`}>
            <img
              src={meta.portraitSrc}
              alt=""
              className="h-24 w-24 rounded-full object-cover shadow-xl"
              style={{ boxShadow: `0 0 0 3px ${meta.hex}80, 0 0 28px ${meta.hex}55` }}
            />
            <div
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-dojo-surface-raised"
              style={{ backgroundColor: meta.hex }}
            >
              <Icon className="h-4 w-4 text-white" />
            </div>
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
