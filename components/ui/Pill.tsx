/* ───────────────────────────────────────────────
   Pill — outlined, icon-prefixed, used for behavior-mode & practice focus
   ─────────────────────────────────────────────── */

'use client';

import { cn, behaviorModeClass, type BehaviorMode } from '@/lib/design-tokens';

interface PillProps {
  children: React.ReactNode;
  variant?: BehaviorMode | 'default';
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Pill({ children, variant = 'default', active = false, onClick, className }: PillProps) {
  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
    variant === 'default' && 'border-dojo-border text-dojo-text-muted',
    variant in behaviorModeClass && behaviorModeClass[variant as BehaviorMode],
    active && 'bg-dojo-accent border-dojo-accent text-white',
    onClick && 'cursor-pointer hover:opacity-80',
    className,
  );
  if (onClick) {
    return <button type="button" className={classes} onClick={onClick}>{children}</button>;
  }
  return <span className={classes}>{children}</span>;
}
