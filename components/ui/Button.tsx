/* ───────────────────────────────────────────────
   Button — primary, secondary, ghost variants
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-[--radius-md] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed',
    variant === 'primary' && 'bg-dojo-accent text-white hover:bg-dojo-accent/90',
    variant === 'secondary' && 'border border-dojo-border bg-dojo-surface text-dojo-text-primary hover:bg-dojo-surface-raised',
    variant === 'ghost' && 'text-dojo-text-muted hover:bg-dojo-surface-raised hover:text-dojo-text-primary',
    variant === 'danger' && 'bg-dojo-danger/10 text-dojo-danger border border-dojo-danger/30 hover:bg-dojo-danger/20',
    size === 'sm' && 'px-3 py-1.5 text-xs',
    size === 'md' && 'px-4 py-2 text-sm',
    size === 'lg' && 'px-6 py-3 text-base',
    className,
  );

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}
