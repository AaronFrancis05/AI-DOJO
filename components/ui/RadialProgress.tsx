/* ───────────────────────────────────────────────
   RadialProgress — donut ring for a single 0–100 figure
   Home's daily goal, and anywhere a percentage deserves
   more weight than a ProgressBar gives it.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';

interface RadialProgressProps {
  value: number;                 // 0–100
  max?: number;                  // default 100
  size?: number;                 // outer diameter in px, default 128
  thickness?: number;            // ring width in px, default 12
  color?: 'accent' | 'success' | 'warning' | 'danger';
  /** Centre content — a figure and its unit, usually. */
  children?: React.ReactNode;
  className?: string;
  /** Announced to screen readers; the ring itself is decorative without it. */
  label?: string;
}

const strokeVar = {
  accent:  'var(--color-accent)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-danger)',
};

export function RadialProgress({
  value,
  max = 100,
  size = 128,
  thickness = 12,
  color = 'accent',
  children,
  className,
  label,
}: RadialProgressProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {/* -90° so the ring fills clockwise from twelve o'clock. */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeVar[color]}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className="transition-all duration-500 motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
