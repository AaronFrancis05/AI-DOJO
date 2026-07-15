/* ───────────────────────────────────────────────
   ProgressBar — thin bar for XP, skill scores, etc.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';

interface ProgressBarProps {
  value: number;        // 0–100
  max?: number;         // default 100
  size?: 'sm' | 'md' | 'lg';
  color?: 'accent' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  className?: string;
}

const colorClasses = {
  accent:  'bg-dojo-accent',
  success: 'bg-dojo-success',
  warning: 'bg-dojo-warning',
  danger:  'bg-dojo-danger',
};

export function ProgressBar({
  value,
  max = 100,
  size = 'sm',
  color = 'accent',
  showLabel = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex-1 overflow-hidden rounded-full bg-dojo-border',
          size === 'sm' ? 'h-1.5' : size === 'md' ? 'h-2.5' : 'h-4',
        )}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClasses[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-dojo-text-muted shrink-0">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
