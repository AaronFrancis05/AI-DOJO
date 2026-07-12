/* ───────────────────────────────────────────────
   Toggle — binary switch for settings, mode toggles
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
}

export function Toggle({ enabled, onChange, label, description, className }: ToggleProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {(label || description) && (
        <div className="flex-1">
          {label && <p className="text-sm font-medium text-dojo-text-primary">{label}</p>}
          {description && <p className="text-xs text-dojo-text-muted">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          enabled ? 'bg-dojo-accent' : 'bg-dojo-border',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
