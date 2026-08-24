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
        className={`relative aspect-[11/10] max-h-full w-full max-w-md overflow-hidden rounded-2xl border bg-dojo-surface-raised shadow-2xl ${reduced ? '' : 'animate-in zoom-in-95 duration-300'}`}
        style={{ borderColor: `${meta.hex}66`, boxShadow: `0 0 0 1px ${meta.hex}33, 0 24px 60px -12px ${meta.hex}55` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Phase character art, full-bleed — the card IS the portrait. */}
        <div
          className={`absolute inset-0 bg-no-repeat ${reduced ? '' : 'animate-in fade-in zoom-in-105 duration-500'}`}
          style={{
            backgroundImage: `url('${meta.portraitSrc}')`,
            backgroundSize: meta.artSize,
            backgroundPosition: meta.artPosition,
          }}
          role="img"
          aria-label={`${meta.title} coach portrait`}
        />

        {/* Copy legibility scrims — kept off the character, which sits right of centre. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/80 via-black/25 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${meta.glowClass}`} />

        <button
          type="button"
          onClick={onDismiss}
          className="tap-target absolute right-3 top-3 z-10 text-white/70 transition-colors hover:text-white"
          aria-label="Skip"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="absolute inset-x-0 top-0 z-10 p-5">
          <h2
            className="text-2xl font-bold tracking-tight text-white"
            style={{ textShadow: `0 2px 18px ${meta.hex}cc, 0 1px 3px rgba(0,0,0,0.85)` }}
          >
            {meta.title}
          </h2>
          <p
            className="mt-2 max-w-56 text-sm leading-snug text-white/85"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}
          >
            {meta.description}
          </p>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center px-5 pb-5">
          {PHASE_ORDER.map((key, index) => {
            const stepMeta = getPhaseMeta(key);
            const isCurrent = key === meta.key;
            const isDone = stepMeta.order < meta.order;
            return (
              <div key={key} className="flex flex-1 items-center last:flex-none">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
                  style={
                    isCurrent
                      ? { backgroundColor: meta.hex, borderColor: 'transparent', color: '#fff', boxShadow: `0 0 16px ${meta.hex}` }
                      : { borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.65)' }
                  }
                >
                  {stepMeta.order}
                </span>
                {index < PHASE_ORDER.length - 1 && (
                  <span
                    className="h-px flex-1"
                    style={{ backgroundColor: isDone ? `${meta.hex}cc` : 'rgba(255,255,255,0.22)' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
