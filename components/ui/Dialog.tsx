/* ───────────────────────────────────────────────
   Dialog — shared modal/dialogue section primitive.
   Bottom-sheet on mobile, centered on sm+; ESC/backdrop
   to close; body scroll locked while open; focus restored.
   Use instead of one-off page routes for focused flows.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/design-tokens';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  label?: string;
  className?: string;
  children: React.ReactNode;
}

const sizeClasses = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  label,
  className,
  children,
}: DialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
    >
      <div
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-dojo-border bg-dojo-sidebar shadow-2xl sm:rounded-2xl',
          sizeClasses[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-[--radius-md] text-dojo-text-muted transition-colors hover:bg-dojo-surface-raised hover:text-dojo-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
        >
          <X className="h-5 w-5" />
        </button>

        {(title || subtitle) && (
          <header className="shrink-0 border-b border-dojo-border px-6 py-4 sm:px-6">
            {title && (
              <h2 className="text-lg font-bold tracking-tight text-dojo-text-primary">{title}</h2>
            )}
            {subtitle && <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">{subtitle}</p>}
          </header>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-dojo-border bg-dojo-canvas/40 px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
