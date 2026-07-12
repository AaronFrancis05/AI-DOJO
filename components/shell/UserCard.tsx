/* ───────────────────────────────────────────────
   UserCard — avatar, name, tier badge, level/XP bar
   Rendered at the sidebar bottom, persistent across all pages.
   ─────────────────────────────────────────────── */

'use client';

import { cn, colors } from '@/lib/design-tokens';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Crown } from 'lucide-react';

interface UserCardProps {
  name: string;
  tier: 'free' | 'premium';
  level: number;
  xp: number;
  xpToNext: number;    // total XP needed for next level
  avatarSrc?: string | null;
  avatarColor?: string;
  className?: string;
}

export function UserCard({
  name,
  tier,
  level,
  xp,
  xpToNext,
  avatarSrc,
  avatarColor = colors.accent,
  className,
}: UserCardProps) {
  return (
    <div className={cn('border-t border-dojo-border p-4', className)}>
      <div className="flex items-center gap-3">
        <Avatar name={name} src={avatarSrc} color={avatarColor} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-dojo-text-primary truncate">{name}</p>
            {tier === 'premium' && (
              <Crown className="h-3.5 w-3.5 text-dojo-warning shrink-0" />
            )}
          </div>
          <Badge variant={tier === 'premium' ? 'accent' : 'default'} className="mt-0.5">
            {tier === 'premium' ? 'Premium' : 'Free'}
          </Badge>
        </div>
      </div>

      {/* Level + XP */}
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-dojo-text-muted">Level {level}</span>
          <span className="text-xs text-dojo-text-muted">{xp} / {xpToNext} XP</span>
        </div>
        <ProgressBar value={xp} max={xpToNext} color="accent" size="sm" />
      </div>
    </div>
  );
}
