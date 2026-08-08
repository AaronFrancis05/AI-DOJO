'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/design-tokens';
import { Send } from 'lucide-react';

interface MessageComposerProps {
  disabled?: boolean;
  onSend: (text: string) => void;
}

/**
 * Pill-shaped composer with a filled circular accent send button.
 * Enter sends; Shift+Enter inserts a newline. Matches the reference
 * app's pill composer treatment (Reference 1) with a clear affordance.
 */
export function MessageComposer({ disabled, onSend }: MessageComposerProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const canSend = value.trim().length > 0 && !disabled;

  function handleCompose() {
    if (!canSend || !value.trim()) return;
    onSend(value.trim());
    setValue('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCompose();
    }
  }

  return (
    <div className="flex items-end gap-2 px-3 pb-3 pt-2">
      <div
        className={cn(
          'flex flex-1 items-center rounded-full border border-dojo-border bg-dojo-surface px-4 py-2 transition-shadow focus-within:ring-2 focus-within:ring-dojo-accent/30',
          disabled && 'opacity-60',
        )}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Loading room…' : 'Enter your message'}
          aria-label="Message"
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={handleCompose}
        disabled={!canSend}
        aria-label="Send message"
        className="tap-target flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dojo-accent text-white shadow-lg shadow-dojo-accent/25 transition-all hover:bg-dojo-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <Send className="h-5 w-5" />
      </button>
    </div>
  );
}