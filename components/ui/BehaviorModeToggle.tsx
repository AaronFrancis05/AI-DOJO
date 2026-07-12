/* ───────────────────────────────────────────────
   BehaviorModeToggle — Standard / Trouble pill toggle
   Shared between Situation Picker and Settings default mode.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import type { BehaviorMode } from '@/lib/design-tokens';
import { Shield, AlertTriangle } from 'lucide-react';

interface BehaviorModeToggleProps {
  value: BehaviorMode;
  onChange: (mode: BehaviorMode) => void;
  className?: string;
}

export function BehaviorModeToggle({ value, onChange, className }: BehaviorModeToggleProps) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => onChange('standard')}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          value === 'standard'
            ? 'border-dojo-success bg-dojo-success/10 text-dojo-success'
            : 'border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary',
        )}
      >
        <Shield className="h-3.5 w-3.5" />
        Standard
      </button>
      <button
        type="button"
        onClick={() => onChange('trouble')}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          value === 'trouble'
            ? 'border-dojo-danger bg-dojo-danger/10 text-dojo-danger'
            : 'border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary',
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Trouble
      </button>
    </div>
  );
}
