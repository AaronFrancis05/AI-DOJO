/* ───────────────────────────────────────────────
   Card — surface background with border, used throughout
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  raised?: boolean;   // use surface-raised bg
  onClick?: () => void;
  hoverable?: boolean;
  /** DOM id, so a card can be a link/scroll anchor (e.g. `#unit-12`). */
  id?: string;
}

export function Card({ children, className, raised = false, onClick, hoverable = false, id }: CardProps) {
  return (
    <div
      id={id}
      className={cn(
        'rounded-[--radius-md] border border-dojo-border p-4',
        raised ? 'bg-dojo-surface-raised' : 'bg-dojo-surface',
        hoverable && 'cursor-pointer transition-all hover:border-dojo-accent hover:shadow-lg hover:shadow-dojo-accent/5',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
