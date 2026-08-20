'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Volume2, Copy, Check, ChevronDown } from 'lucide-react';
import { cleanDisplay } from '@/lib/roleplay/clean-display';
import { getPhaseMeta } from '@/lib/roleplay/phase-ui';

interface CorrectionTip {
  correctionType: string;
  originalText: string;
  correctedText: string;
  originalPhonetic?: string | null;
  correctedPhonetic?: string | null;
  explanation: string;
  severity: string;
}

export interface TurnData {
  id: number;
  turnNo: number;
  speaker: 'user' | 'ai';
  messageTarget: string;
  messageNative: string;
  messagePhonetic: string | null;
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

function WaveformIcon() {
  return (
    <span className="flex items-end gap-[1px] h-4 opacity-60">
      {[6, 10, 14, 10, 6].map((h, i) => (
        <span key={i} className="w-[2px] rounded-full bg-dojo-accent" style={{ height: `${h}px` }} />
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
  const aiPortrait = getPhaseMeta(phase ?? 'orientation').portraitSrc;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledAway, setScrolledAway] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'key' | 'notes'>('all');

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

  const tabs = [
    { key: 'all' as const, label: 'All' },
    { key: 'key' as const, label: 'Key Phrases' },
    { key: 'notes' as const, label: 'Notes' },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b border-dojo-border/30 shrink-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              activeTab === key
                ? 'bg-dojo-accent text-white'
                : 'text-dojo-text-muted hover:text-dojo-text-primary hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto no-scrollbar px-4 sm:px-6 py-4 space-y-4 overscroll-contain">
        {conversations.map((turn) => {
          const isAi = turn.speaker === 'ai';
          const isLatestAi = isAi && turn.id === Math.max(...conversations.filter(c => c.speaker === 'ai').map(c => c.id), -1);
          const timestamp = turn.receivedAt
            ? new Date(turn.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null;
          const displayText = cleanDisplay(turn.messageTarget);

          return (
            <div key={turn.id} className={`flex items-start gap-3 ${!isAi ? 'flex-row-reverse' : 'flex-row'} ${turn.pending ? 'opacity-60' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {/* Avatar badge */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white/10 ${
                  isAi ? '' : ''
                }`}
                style={{ backgroundColor: isAi ? charColor : turn.failed ? '#DC2626' : '#6366f1' }}
              >
                {isAi && aiPortrait ? (
                  <img src={aiPortrait} alt={charName} className="h-full w-full object-cover" />
                ) : isAi ? (
                  charName[0]
                ) : (
                  'U'
                )}
              </div>

              <div className={`flex max-w-[80%] flex-col ${!isAi ? 'items-end' : 'items-start'}`}>
                {/* Name + timestamp header */}
                <div className={`flex items-center gap-2 px-1 mb-1 ${!isAi ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-xs font-semibold text-dojo-text-primary">
                    {isAi ? charName : 'You'}
                  </span>
                  {timestamp && (
                    <span className="text-[10px] text-dojo-text-muted/60">{timestamp}</span>
                  )}
                  {turn.failed && (
                    <span className="text-[10px] text-dojo-danger font-medium">Failed</span>
                  )}
                </div>

                {/* Message bubble */}
                <div
                  className={`relative overflow-hidden px-4 py-3 shadow-lg transition-all duration-200 ${
                    isAi
                      ? 'rounded-2xl rounded-tl-sm bg-dojo-surface-raised/90 border border-dojo-border/60 backdrop-blur-md'
                      : turn.failed
                        ? 'rounded-2xl rounded-tr-sm bg-dojo-danger/10 border border-dojo-danger/30'
                        : 'rounded-2xl rounded-tr-sm bg-dojo-accent/15 border border-dojo-accent/20'
                  }`}
                >
                  <p className="text-sm text-dojo-text-primary leading-relaxed">{displayText}</p>

                  {turn.messagePhonetic && !turn.pending && (
                    <p className="mt-1 text-[11px] text-dojo-text-muted italic leading-relaxed">{turn.messagePhonetic}</p>
                  )}

                  {turn.messageNative && (
                    <p className="mt-1 text-[11px] text-dojo-text-muted leading-relaxed">{turn.messageNative}</p>
                  )}

                  {/* Waveform icon for AI messages */}
                  {isAi && (
                    <div className="absolute top-3 right-3">
                      <WaveformIcon />
                    </div>
                  )}
                </div>

                {/* Action buttons for AI messages */}
                {isAi && (
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <button
                      onClick={() => onReplay(turn)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-dojo-text-muted/60 hover:text-dojo-accent hover:bg-dojo-accent/10 transition-colors"
                    >
                      <Volume2 className="h-3 w-3" />
                    </button>
                    <CopyButton text={displayText} />
                    {isLatestAi && <SpeakingWave active={avatarMode === 'talking'} />}
                  </div>
                )}

                {/* Delivery check for user messages */}
                {!isAi && !turn.failed && !turn.pending && (
                  <div className="flex items-center gap-1 mt-0.5 px-1">
                    <Check className="h-3 w-3 text-dojo-accent" />
                  </div>
                )}

                {/* Corrections */}
                {turn.corrections && turn.corrections.length > 0 && !turn.pending && phase !== 'unguided' && (
                  <div className="mt-2 w-full space-y-1.5 rounded-xl bg-dojo-surface/60 border border-dojo-border/40 px-3 py-2">
                    {turn.corrections.map((tip, i) => (
                      <div key={i} className="text-[11px] leading-relaxed">
                        <div className="flex items-start gap-1.5">
                          <span className={`shrink-0 mt-0.5 inline-block h-4 w-4 rounded-full text-[8px] font-bold text-center leading-4 ${
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
                            {tip.correctedPhonetic && (
                              <span className="ml-1 italic text-dojo-text-muted">({tip.correctedPhonetic})</span>
                            )}
                            <p className="text-dojo-text-muted/80 mt-0.5">{tip.explanation}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {streamingText && (
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white/10"
              style={{ backgroundColor: charColor }}
            >
              {aiPortrait ? (
                <img src={aiPortrait} alt={charName} className="h-full w-full object-cover" />
              ) : (
                charName[0]
              )}
            </div>
            <div className="flex max-w-[80%] flex-col items-start">
              <div className="flex items-center gap-2 px-1 mb-1">
                <span className="text-xs font-semibold text-dojo-text-primary">{charName}</span>
                <SpeakingWave active={true} />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-dojo-surface-raised/90 border border-dojo-border/60 backdrop-blur-md px-4 py-3 shadow-lg">
                <p className="text-sm text-dojo-text-primary leading-relaxed">
                  {streamingText}
                  <span className="inline-block w-0.5 h-4 bg-dojo-accent ml-0.5 animate-pulse align-middle" />
                </p>
              </div>
            </div>
          </div>
        )}

        {suggestedReplies && suggestedReplies.length > 0 && !sending && conversations.length > 0 && (
          <div className="px-1 pt-2">
            <p className="text-[11px] text-dojo-text-muted mb-2 font-semibold uppercase tracking-wider">Suggested replies</p>
            <div className="flex flex-wrap gap-2">
              {suggestedReplies.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => onSend(reply)}
                  disabled={sending || !isActive}
                  className="rounded-full border border-dojo-accent/30 bg-dojo-accent/10 px-4 py-2 text-xs font-medium text-dojo-text-primary hover:border-dojo-accent hover:bg-dojo-accent/20 transition-all duration-200 disabled:opacity-40"
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
    <button
      onClick={handleCopy}
      className="flex h-6 w-6 items-center justify-center rounded-full text-dojo-text-muted/60 hover:text-dojo-accent hover:bg-dojo-accent/10 transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-dojo-success transition-colors" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
