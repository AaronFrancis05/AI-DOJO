/* ───────────────────────────────────────────────
   HexBadge — hexagon clipPath wrapper around a lucide icon
   Used for achievement badges in the Home dashboard.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import type { LucideIcon } from 'lucide-react';

interface HexBadgeProps {
  icon: LucideIcon;
  label?: string;
  unlocked?: boolean;
  size?: number;        // default 48
  className?: string;
}

export function HexBadge({
  icon: Icon,
  label,
  unlocked = true,
  size = 48,
  className,
}: HexBadgeProps) {
  const half = size / 2;
  const w = size;
  const h = size * 0.866; // hexagon height ≈ width * √3/2

  // Build a flat-top hexagon clipPath
  const points = [
    [w * 0.5, 0],
    [w, h * 0.25],
    [w, h * 0.75],
    [w * 0.5, h],
    [0, h * 0.75],
    [0, h * 0.25],
  ].map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <div className={cn('inline-flex flex-col items-center gap-1', className)}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className={cn(
          'shrink-0',
          unlocked ? 'opacity-100' : 'opacity-30',
        )}
      >
        <defs>
          <clipPath id={`hex-${label ?? 'badge'}`}>
            <polygon points={points} />
          </clipPath>
        </defs>
        {/* Hexagon background */}
        <polygon
          points={points}
          fill={unlocked ? '#2D3BC5' : '#1C2A42'}
          stroke={unlocked ? '#2D3BC5' : '#8A93A8'}
          strokeWidth="1.5"
        />
        {/* Icon */}
        <foreignObject
          clipPath={`url(#hex-${label ?? 'badge'})`}
          width={w}
          height={h}
        >
          <div className="flex h-full items-center justify-center">
            <Icon size={half * 0.7} color={unlocked ? '#F4F4F8' : '#8A93A8'} />
          </div>
        </foreignObject>
      </svg>
      {label && (
        <span className="text-[10px] text-dojo-text-muted text-center leading-tight max-w-[60px]">
          {label}
        </span>
      )}
    </div>
  );
}
