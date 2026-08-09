'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/design-tokens';
import { Avatar } from '@/components/ui/Avatar';
import { langFlag, type ChatMessage } from '@/lib/chat-types';
import { Play, Pause, Mic } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
  showSender: boolean;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function VoicePlayer({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!message.audioUrl) return;
    const audio = new Audio(message.audioUrl);
    audioRef.current = audio;
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    });
    audio.addEventListener('ended', () => setPlaying(false));
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [message.audioUrl]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play().catch(() => setPlaying(false));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      className={cn(
        'flex min-w-40 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left',
        mine ? 'bg-white/15' : 'bg-dojo-canvas',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          mine ? 'bg-white/90 text-dojo-accent' : 'bg-dojo-accent text-white',
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </span>
      <span className="flex h-6 min-w-16 flex-1 items-center">
        <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-current opacity-25">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-current"
            style={{ width: `${progress}%` }}
          />
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 text-xs font-medium tabular-nums',
          mine ? 'text-white/90' : 'text-dojo-text-muted',
        )}
      >
        {formatDuration(message.audioDurationMs)}
      </span>
    </button>
  );
}

/**
 * A single chat bubble. Incoming messages are light-surface and left-aligned with
 * a small tail; outgoing messages are accent-filled and right-aligned with a tail.
 * Voice messages render a compact Wave-style player; when their transcript has been
 * translated, a small pill toggle lets the reader flip between the two views.
 */
export function MessageBubble({ message, showSender }: MessageBubbleProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const isTranslated =
    message.translationProvider === 'ugajapa' && message.body !== message.translatedBody;
  const target = langFlag(message.sourceLanguage);
  const displayBody = isTranslated && showOriginal ? message.body : message.translatedBody;

  const isVoice = Boolean(message.audioUrl);
  const hasText = !isVoice || (Boolean(message.body) && message.body !== '[Voice message]');

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
            'relative space-y-1.5 px-3 py-2 shadow-sm',
            message.isMine
              ? 'rounded-2xl rounded-br-md bg-dojo-accent text-white'
              : 'rounded-2xl rounded-bl-md border border-dojo-border bg-dojo-surface text-dojo-text-primary',
          )}
        >
          {isVoice && <VoicePlayer message={message} mine={message.isMine} />}

          {hasText && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {displayBody}
            </p>
          )}

          {isVoice && (
            <p
              className={cn(
                'flex items-center gap-1 text-[11px] leading-none',
                message.isMine ? 'text-white/80' : 'text-dojo-text-muted',
              )}
            >
              <Mic className="h-3 w-3" />
              {isTranslated ? 'Translated voice message' : 'Voice message'}
            </p>
          )}
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