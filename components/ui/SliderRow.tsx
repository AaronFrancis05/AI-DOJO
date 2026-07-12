/* ───────────────────────────────────────────────
   SliderRow — labelled slider for settings
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';

interface SliderRowProps {
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  showValue?: boolean;
  className?: string;
}

export function SliderRow({
  label,
  description,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  showValue = true,
  className,
}: SliderRowProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-dojo-text-primary">{label}</p>
          {description && <p className="text-xs text-dojo-text-muted">{description}</p>}
        </div>
        {showValue && (
          <span className="text-sm font-semibold text-dojo-text-primary">{value}</span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-dojo-border accent-dojo-accent
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-dojo-accent [&::-webkit-slider-thumb]:shadow"
      />
    </div>
  );
}
