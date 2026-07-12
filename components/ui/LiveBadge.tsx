/* ───────────────────────────────────────────────
   LiveBadge — pulsing red dot + "Live" text
   Used on Home dashboard in-progress session cards,
   and later in the real-time Roleplay Room.
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';

interface LiveBadgeProps {
  className?: string;
}

export function LiveBadge({ className }: LiveBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dojo-danger opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-dojo-danger" />
      </span>
      <span className="text-xs font-semibold text-dojo-danger">Live</span>
    </span>
  );
}
