/* ───────────────────────────────────────────────
   Badge — solid-colour label for skill levels
   ─────────────────────────────────────────────── */

'use client';

import { cn, skillLevelBadgeClass, type SkillLevel } from '@/lib/design-tokens';

interface BadgeProps {
  children: React.ReactNode;
  variant?: SkillLevel | 'accent' | 'default' | 'premium' | 'outline';
  className?: string;
}

const accentStyles: Record<string, string> = {
  accent: 'bg-[#2D3BC5] text-white',
  default: 'bg-[#1C2A42] text-[#8A93A8]',
  premium: 'bg-gradient-to-r from-[#F0A93B] to-[#E3A939] text-black shadow-lg shadow-dojo-warning/20',
  outline: 'border border-dojo-border bg-transparent text-[#8A93A8]',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const isSpecial = variant === 'accent' || variant === 'default' || variant === 'premium' || variant === 'outline';
  const colorClass = isSpecial
    ? accentStyles[variant as string]
    : skillLevelBadgeClass[variant as SkillLevel];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        colorClass,
        className,
      )}
    >
      {children}
    </span>
  );
}
