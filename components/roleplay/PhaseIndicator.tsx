'use client';

import { useEffect, useRef, useState } from 'react';
import { getPhaseMeta } from '@/lib/roleplay/phase-ui';

interface PhaseIndicatorProps {
  phase: string;
}

export function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const meta = getPhaseMeta(phase);
  const prevPhaseRef = useRef<string | null>(null);
  const [justChanged, setJustChanged] = useState(false);

  useEffect(() => {
    if (prevPhaseRef.current !== null && prevPhaseRef.current !== phase) {
      setJustChanged(true);
      const t = setTimeout(() => setJustChanged(false), 1000);
      prevPhaseRef.current = phase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-shadow ${meta.badgeClass} ${justChanged ? 'animate-glow-pulse' : ''}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${phase === 'completed' ? '' : 'animate-pulse'}`}
        style={{ backgroundColor: meta.hex }}
      />
      {meta.label}
    </span>
  );
}
