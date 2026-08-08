'use client';

import { useState } from 'react';
import { cn } from '@/lib/design-tokens';
import { Avatar } from '@/components/ui/Avatar';
import { langFlag, type ChatMessage } from '@/lib/chat-types';

interface MessageBubbleProps {
  message: ChatMessage;
  showSender: boolean;
}

/**
 * A single chat bubble. Incoming messages are light-surface and left-aligned with
 * a small tail; outgoing messages are accent-filled and right-aligned with a tail.
 * When a translation differs from the original, a small pill toggle lets the
 * reader flip between the translated view and the original text.
 */
export function MessageBubble({ message, showSender }: MessageBubbleProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const isTranslated =
    message.translationProvider === 'ugajapa' && message.body !== message.translatedBody;
  const target = langFlag(message.sourceLanguage);
  const displayBody = isTranslated && showOriginal ? message.body : message.translatedBody;

  return (
    <div className={cn('flex w-full gap-2.5', message.isMine ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar column — incoming only */}
      {message.isMine ? (
        <div className="w-8 shrink-0" aria-hidden="true" />
      ) : (
        <div className="w-8 shrink-0 self-end">
          <Avatar
            name={message.senderName}
            src={message.senderAvatarSrc}
            size="sm"
            className="h-7 w-7 text-[10px]"
          />
        </div>
      )}

      <div className={cn('flex max-w-[78%] min-w-0 flex-col', message.isMine ? 'items-end' : 'items-start')}>
        {/* Sender name row — group rooms */}
        {showSender && !message.isMine && (
          <span className="mb-1 ml-1 text-xs font-semibold text-dojo-text-muted">
            {message.senderName}
          </span>
        )}

        <div
          className={cn(
            'relative whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed shadow-sm',
            message.isMine
              ? 'rounded-2xl rounded-br-md bg-dojo-accent text-white'
              : 'rounded-2xl rounded-bl-md border border-dojo-border bg-dojo-surface text-dojo-text-primary',
          )}
        >
          {displayBody}
        </div>

        {/* Time + translation toggle */}
        <div className={cn('mt-1 flex items-center gap-2 px-1', message.isMine ? 'flex-row-reverse' : 'flex-row')}>
          <span className="text-[10px] text-dojo-text-muted">
            {new Date(message.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>

          {isTranslated && (
            <button
              type="button"
              onClick={() => setShowOriginal(v => !v)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                showOriginal
                  ? 'border-dojo-accent bg-dojo-accent/10 text-dojo-accent'
                  : 'border-dojo-border text-dojo-text-muted hover:bg-dojo-surface-raised',
              )}
            >
              {target.flag && <span aria-hidden="true">{target.flag}</span>}
              {showOriginal ? 'Show translation' : 'Show original'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
