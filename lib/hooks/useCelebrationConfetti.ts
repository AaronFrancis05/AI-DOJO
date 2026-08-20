'use client';

import { useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';

export type ConfettiBurstKind = 'full' | 'toast';

const BURST_PRESETS: Record<ConfettiBurstKind, confetti.Options> = {
  full: { particleCount: 140, spread: 90, origin: { y: 0.4 }, colors: ['#F2A93B', '#4FD1C5', '#8FE2B5'] },
  toast: { particleCount: 40, spread: 55, origin: { y: 0.3 }, scalar: 0.7, colors: ['#4FD1C5', '#8FE2B5'] },
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useCelebrationConfetti() {
  const firedRef = useRef(false);

  const fireBurst = useCallback((kind: ConfettiBurstKind, opts?: confetti.Options) => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (prefersReducedMotion()) return;
    confetti({ ...BURST_PRESETS[kind], ...opts });
  }, []);

  const reset = useCallback(() => { firedRef.current = false; }, []);

  return { fireBurst, reset, prefersReducedMotion };
}
