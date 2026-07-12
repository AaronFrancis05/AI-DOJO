/* ───────────────────────────────────────────────
   Badge — solid-colour label for skill levels
   ─────────────────────────────────────────────── */

'use client';

import { cn, colors, type SkillLevel } from '@/lib/design-tokens';

interface BadgeProps {
  children: React.ReactNode;
  variant?: SkillLevel | 'accent' | 'default';
  className?: string;
}

const variantStyles: Record<string, string> = {
  beginner:     `bg-[${colors.success}] text-white`,
  intermediate: `bg-[${colors.warning}] text-black`,
  advanced:     `bg-[${colors.danger}] text-white`,
  accent:       `bg-[${colors.accent}] text-white`,
  default:      `bg-[${colors.border}] text-[${colors.textMuted}]`,
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
