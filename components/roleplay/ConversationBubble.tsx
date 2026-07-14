'use client';

import { cn } from '@/lib/design-tokens';
import { Smile } from 'lucide-react';

interface ConversationBubbleProps {
  speaker: 'user' | 'ai';
  name: string;
  accentColor: string;
  messageJp: string;
  messageRomaji?: string;
  messageEn?: string;
  emotionTone?: string;
  gestureHint?: string;
  className?: string;
}

export function ConversationBubble({
  speaker,
  name,
  accentColor,
  messageJp,
  messageRomaji,
  messageEn,
  emotionTone,
  gestureHint,
  className,
}: ConversationBubbleProps) {
  const isUser = speaker === 'user';

  return (
    <div className={cn(
      'flex w-full gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300',
      isUser ? 'flex-row-reverse' : 'flex-row',
      className
    )}>
      {/* Avatar Circle */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-1 ring-white/10"
        style={{ backgroundColor: accentColor }}
      >
        {name[0]}
      </div>

      <div className={cn(
        'flex max-w-[85%] flex-col',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Name / Metadata Label */}
        <div className="flex items-center gap-2 px-1 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-dojo-text-muted opacity-80">
            {isUser ? 'You' : name}
          </span>
          {!isUser && emotionTone && (
            <span className="rounded-full bg-dojo-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-dojo-accent capitalize border border-dojo-accent/20">
              {emotionTone}
            </span>
          )}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            'group relative overflow-hidden px-4 py-3 shadow-xl transition-all duration-200',
            isUser 
              ? 'rounded-2xl rounded-tr-none bg-dojo-accent text-white hover:bg-dojo-accent/90' 
              : 'rounded-2xl rounded-tl-none border border-dojo-border bg-dojo-surface-raised/90 backdrop-blur-md text-dojo-text-primary hover:border-dojo-accent/40'
          )}
        >
          <p className="text-sm font-medium leading-relaxed tracking-wide">
            {messageJp}
          </p>
          
          {(messageRomaji || messageEn) && (
            <div className={cn(
              'mt-2 space-y-1 border-t pt-2 transition-opacity duration-300',
              isUser ? 'border-white/10' : 'border-dojo-border'
            )}>
              {messageRomaji && (
                <p className={cn(
                  'text-[11px] italic leading-tight',
                  isUser ? 'text-white/80' : 'text-dojo-text-muted'
                )}>
                  {messageRomaji}
                </p>
              )}
              {messageEn && (
                <p className={cn(
                  'text-[11px] leading-tight',
                  isUser ? 'text-white/70' : 'text-dojo-text-muted'
                )}>
                  {messageEn}
                </p>
              )}
            </div>
          )}

          {/* Decorative highlight for active state */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Gesture Hint */}
        {gestureHint && (
          <span className="mt-1.5 flex items-center gap-1 px-1 text-[10px] font-medium italic text-dojo-text-muted opacity-60">
             🎭 {gestureHint}
          </span>
        )}
      </div>
    </div>
  );
}

