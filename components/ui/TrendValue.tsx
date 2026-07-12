/* ───────────────────────────────────────────────
   TrendValue — number + ▲/▼ arrow with colour
   Used in StatisticsCard, SkillsRadar, etc.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TrendValueProps {
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;   // e.g. "+5%", "+12 words"
  className?: string;
}

export function TrendValue({ value, trend = 'neutral', trendLabel, className }: TrendValueProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="text-dojo-text-primary font-semibold">{value}</span>
      {trend !== 'neutral' && trendLabel && (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-xs font-medium',
            trend === 'up' ? 'text-dojo-success' : 'text-dojo-danger',
          )}
        >
          {trend === 'up' ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {trendLabel}
        </span>
      )}
    </span>
  );
}
