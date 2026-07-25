'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Volume2, Copy, Check, ChevronDown } from 'lucide-react';

interface CorrectionTip {
  correctionType: string;
  originalText: string;
  correctedText: string;
  originalRomaji?: string | null;
  correctedRomaji?: string | null;
  explanation: string;
  severity: string;
}

export interface TurnData {
  id: number;
  turnNo: number;
  speaker: 'user' | 'ai';
  messageTarget: string;
  messageNative: string;
  messageRomaji: string | null;
  emotionTone?: string;
  gestureHint?: string;
  corrections?: CorrectionTip[];
  pending?: boolean;
  failed?: boolean;
  audioUrl?: string | null;
  audioStatus?: string | null;
  receivedAt?: number;
}

interface ChatPanelProps {
  conversations: TurnData[];
  charName: string;
  charColor: string;
  avatarMode: 'idle' | 'listening' | 'talking';
  onSend: (text: string) => void;
  onReplay: (turn: TurnData) => void;
  sending: boolean;
  isActive: boolean;
  targetName: string;
  suggestedReplies?: string[];
  phase?: string;
  streamingText?: string;
}

function SpeakingWave({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="flex items-end gap-[2px] h-3.5">
      {[0, 120, 240].map((d) => (
        <span
          key={d}
          className="w-[3px] rounded-full bg-dojo-accent"
          style={{
            height: '10px',
            animation: `typing-bounce 0.9s ease-in-out ${d}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

export function ChatPanel({
  conversations, charName, charColor, avatarMode,
  onSend, onReplay,
  sending, isActive, targetName, suggestedReplies, phase,
  streamingText,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledAway, setScrolledAway] = useState(false);

  useEffect(() => {
    if (!scrolledAway) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, scrolledAway]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom && scrolledAway) setScrolledAway(false);
    if (!atBottom && !scrolledAway) setScrolledAway(true);
  }, [scrolledAway]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-3 overscroll-contain">
        {conversations.map((turn) => {
          const isAi = turn.speaker === 'ai';
          const isLatestAi = isAi && turn.id === Math.max(...conversations.filter(c => c.speaker === 'ai').map(c => c.id), -1);

          return (
            <div key={turn.id} className={`flex ${!isAi ? 'justify-end' : 'justify-start'} ${turn.pending ? 'opacity-60' : ''}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                  isAi
                    ? 'bg-dojo-surface-raised/90 border border-dojo-border'
                    : turn.failed
                      ? 'bg-dojo-danger/10 border border-dojo-danger/30'
                      : 'bg-dojo-accent/20 border border-dojo-accent/30'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white shrink-0"
                    style={{ backgroundColor: isAi ? charColor : turn.failed ? '#DC2626' : '#2D3BC5' }}
                  >
                    {isAi ? charName[0] : 'U'}
                  </span>
                  <span className="text-[11px] font-semibold text-dojo-text-primary">
                    {isAi ? charName : 'You'}
                  </span>
                  {turn.failed && (
                    <span className="text-[10px] text-dojo-danger font-medium">Failed to send</span>
                  )}
                  {isAi && isLatestAi && (
                    <SpeakingWave active={avatarMode === 'talking'} />
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {isAi && (
                      <CopyButton text={turn.messageTarget} />
                    )}
                    {isAi && (
                      <button onClick={() => onReplay(turn)}>
                        <Volume2 className="h-3 w-3 text-dojo-text-muted hover:text-dojo-text-primary transition-colors" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-dojo-text-primary leading-relaxed">{turn.messageTarget}</p>

                {turn.messageRomaji && !turn.pending && (
                  <p className="mt-0.5 text-[11px] text-dojo-text-muted italic">{turn.messageRomaji}</p>
                )}

                {turn.messageNative && (
                  <p className="mt-0.5 text-[11px] text-dojo-text-muted">{turn.messageNative}</p>
                )}

                {turn.corrections && turn.corrections.length > 0 && !turn.pending && phase !== 'unguided' && (
                  <div className="mt-2 space-y-1.5 border-t border-dojo-border/40 pt-2">
                    {turn.corrections.map((tip, i) => (
                      <div key={i} className="text-[11px] leading-relaxed">
                        <div className="flex items-start gap-1.5">
                          <span className={`shrink-0 mt-0.5 inline-block h-3.5 w-3.5 rounded-full text-[8px] font-bold text-center leading-[14px] ${
                            tip.severity === 'major' ? 'bg-dojo-danger/20 text-dojo-danger' :
                            tip.severity === 'moderate' ? 'bg-dojo-warning/20 text-dojo-warning' :
                            'bg-dojo-accent/20 text-dojo-accent'
                          }`}>
                            {tip.severity === 'major' ? '!' : tip.severity === 'moderate' ? '!' : 'i'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="line-through text-dojo-text-muted">{tip.originalText}</span>
                            {' → '}
                            <span className="font-medium text-dojo-text-primary">{tip.correctedText}</span>
                            {tip.correctedRomaji && (
                              <span className="ml-1 italic text-dojo-text-muted">({tip.correctedRomaji})</span>
                            )}
                            <p className="text-dojo-text-muted/80 mt-0.5">{tip.explanation}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {turn.receivedAt && (
                  <p className="mt-1 text-[10px] text-dojo-text-muted/60">
                    {new Date(turn.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 bg-dojo-surface-raised/90 border border-dojo-border">
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white shrink-0"
                  style={{ backgroundColor: charColor }}
                >
                  {charName[0]}
                </span>
                <span className="text-[11px] font-semibold text-dojo-text-primary">{charName}</span>
                <SpeakingWave active={true} />
              </div>
              <p className="text-sm text-dojo-text-primary leading-relaxed">
                {streamingText}
                <span className="inline-block w-0.5 h-4 bg-dojo-accent ml-0.5 animate-pulse" />
              </p>
            </div>
          </div>
        )}

        {suggestedReplies && suggestedReplies.length > 0 && !sending && conversations.length > 0 && (
          <div className="px-1">
            <p className="text-[11px] text-dojo-text-muted mb-2 font-medium">You can say:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedReplies.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => onSend(reply)}
                  disabled={sending || !isActive}
                  className="rounded-full border border-dojo-border bg-dojo-surface-raised/80 px-3 py-1.5 text-xs text-dojo-text-primary hover:border-dojo-accent transition-colors disabled:opacity-40"
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {scrolledAway && (
        <button
          type="button"
          onClick={() => { setScrolledAway(false); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
          className="absolute bottom-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-dojo-accent text-white shadow-lg hover:opacity-90 transition-opacity"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }, [text]);

  return (
    <button onClick={handleCopy}>
      {copied ? (
        <Check className="h-3 w-3 text-dojo-success transition-colors" />
      ) : (
        <Copy className="h-3 w-3 text-dojo-text-muted hover:text-dojo-text-primary transition-colors" />
      )}
    </button>
  );
}
