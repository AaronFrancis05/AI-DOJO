'use client';

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
}: ConversationBubbleProps) {
  const isUser = speaker === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: accentColor }}
      >
        {name[0]}
      </div>
      <div className={`max-w-[70%] ${isUser ? 'items-end' : ''}`}>
        {!isUser && (
          <p className="text-xs text-dojo-text-muted mb-1">{name}</p>
        )}
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'rounded-br-none bg-dojo-accent'
              : 'rounded-tl-none bg-dojo-surface-raised border border-dojo-border'
          }`}
        >
          <p
            className={`text-sm ${
              isUser ? 'text-white' : 'text-dojo-text-primary'
            }`}
          >
            {messageJp}
          </p>
          {messageRomaji && (
            <p className="mt-1 text-xs text-dojo-text-muted italic">
              {messageRomaji}
            </p>
          )}
          {messageEn && (
            <p className="text-xs text-dojo-text-muted italic">
              {messageEn}
            </p>
          )}
        </div>
        {!isUser && (emotionTone || gestureHint) && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-dojo-text-muted">
            <Smile className="h-3 w-3" />
            {emotionTone && <span className="capitalize">{emotionTone}</span>}
            {gestureHint && <span>· {gestureHint}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
