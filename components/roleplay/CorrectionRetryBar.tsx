'use client';
import { Check, X } from 'lucide-react';
import type { PendingRetry } from '@/lib/hooks/useRoleplaySession';

export function CorrectionRetryBar({
  retry,
  onRetry,
  onDismiss,
  disabled,
}: {
  retry: PendingRetry;
  onRetry: () => void;
  onDismiss: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-dojo-border/60 bg-dojo-surface/95 backdrop-blur-md safe-bottom">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-dojo-text-muted mb-1">Try this instead:</p>
        <p className="text-sm font-medium text-dojo-text-primary leading-relaxed truncate">
          {retry.correctedText}
          {retry.correctedPhonetic ? (
            <span className="ml-1.5 italic text-dojo-text-muted font-normal">({retry.correctedPhonetic})</span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onDismiss}
          className="tap-target flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
          aria-label="Skip correction"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-xl bg-dojo-accent px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-dojo-accent/25 hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
          Try this
        </button>
      </div>
    </div>
  );
}
