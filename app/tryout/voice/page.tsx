'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Mic, Volume2, VolumeX, MessageSquare, X, Send } from 'lucide-react';
import { VoiceOnlyStage } from '@/components/roleplay/VoiceOnlyStage';
import { useVoiceInput } from '@/lib/hooks/useVoiceInput';
import { useGuestRoleplaySession } from '@/lib/hooks/useGuestRoleplaySession';
import { stop as stopTts, setOnSpeakingChange, unlockAudio } from '@/lib/roleplay/tts';
import { createReplySpeaker } from '@/lib/roleplay/reply-speech';
import { getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { cleanDisplay } from '@/lib/roleplay/clean-display';
import { TryoutCompleteScreen } from '@/components/marketing/TryoutCompleteScreen';
import { TryoutBlockedScreen } from '@/components/marketing/TryoutBlockedScreen';
import { loadTryoutParams } from '@/lib/tryout/guest-params';
import { useTryoutGate } from '@/lib/hooks/useTryoutGate';

const CHAR_NAME = 'Sam';
const CHAR_COLOR = '#2D3BC5';
const CHAR_ROLE = 'Conversation Partner';

export default function TryoutVoicePage() {
  // useSearchParams needs a Suspense boundary in the app router
  return (
    <Suspense fallback={null}>
      <TryoutVoiceResolver />
    </Suspense>
  );
}

function TryoutVoiceResolver() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTarget = searchParams.get('targetLanguage');
  const queryNative = searchParams.get('nativeLanguage');

  const [params] = useState(() => {
    if (queryTarget && queryNative) return { targetLanguage: queryTarget, nativeLanguage: queryNative };
    return loadTryoutParams();
  });

  useEffect(() => {
    if (!params) router.replace('/');
  }, [params, router]);

  if (!params) {
    return (
      <div className="flex h-dvh items-center justify-center bg-dojo-canvas">
        <div className="animate-pulse text-dojo-text-muted text-sm">Loading…</div>
      </div>
    );
  }

  return <TryoutVoiceSession targetLanguage={params.targetLanguage} nativeLanguage={params.nativeLanguage} />;
}

function TryoutVoiceSession({ targetLanguage, nativeLanguage }: { targetLanguage: string; nativeLanguage: string }) {
  // The page is reachable by direct URL, so it opens the gate itself rather
  // than trusting that /tryout ran first.
  const gate = useTryoutGate();
  const { conversations, sending, limitReached, completed, blocked, blockedRetryAfterMs, error, submitTurnStream, sendGreeting } =
    useGuestRoleplaySession({ targetLanguage, nativeLanguage });

  const [avatarMode, setAvatarMode] = useState<'idle' | 'listening' | 'talking'>('idle');
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(false);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Microphone acquisition is handled once by the recognizer prewarm in
  // useVoiceInput, which holds the stream open for the whole session.

  useEffect(() => {
    setOnSpeakingChange((speaking) => setAvatarMode(speaking ? 'talking' : 'idle'));
    return () => { setOnSpeakingChange(null); stopTts(); };
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, chatOpen]);

  const handleUserUtterance = useCallback(async (text: string) => {
    if (sending || !text.trim() || limitReached || completed) return;
    stopTts();
    const speaker = createReplySpeaker({
      targetBcp47: getBCP47(targetLanguage, 'tts'),
      nativeBcp47: getNativeLangBcp47(nativeLanguage),
      phase: 'orientation',
      isMuted: () => mutedRef.current,
    });
    try {
      await submitTurnStream(text.trim(), {
        onToken: (t) => setStreamingText(t ? cleanDisplay(t) : null),
        // /api/tryout/turn answers with one JSON body rather than a token
        // stream, so the reply arrives whole here; the speaker splits it into
        // sentences so the first one starts without waiting for the rest.
        onTextDone: (t: string) => {
          setStreamingText(null);
          speaker.finish(cleanDisplay(t)).catch(() => {});
        },
      });
    } catch (e) {
      console.error(e);
      stopTts();
    }
  }, [sending, limitReached, completed, submitTurnStream, targetLanguage, nativeLanguage]);

  const handleChatSend = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed || sending) return;
    setChatInput('');
    handleUserUtterance(trimmed);
  }, [chatInput, sending, handleUserUtterance]);

  const bcp47 = getBCP47(targetLanguage, 'stt');
  const voice = useVoiceInput({ lang: bcp47, onFinal: handleUserUtterance });

  // Barge-in lives in useVoiceInput.start(): it silences the character on
  // every press, not only when this derived mode says it is talking. That
  // mode dips to false in the gap between utterances of one reply, and a
  // press landing in the gap used to leave the rest of the reply playing
  // into an open mic.
  const handleMicStart = useCallback(async () => {
    await voice.start();
  }, [voice]);

  if (gate.state === 'blocked' || blocked) {
    return (
      <TryoutBlockedScreen
        targetLanguage={targetLanguage}
        nativeLanguage={nativeLanguage}
        retryAfterMs={gate.state === 'blocked' ? gate.retryAfterMs : blockedRetryAfterMs}
      />
    );
  }

  if (completed || limitReached) {
    return <TryoutCompleteScreen targetLanguage={targetLanguage} nativeLanguage={nativeLanguage} turnCount={conversations.filter(c => c.speaker === 'user').length} />;
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-dojo-canvas">
      <div className="relative z-20 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-dojo-border/60 shrink-0 backdrop-blur-md bg-dojo-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2 rounded-lg text-dojo-text-muted hover:text-dojo-text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium hidden sm:inline">End Preview</span>
          </Link>
          <span className="text-sm font-bold text-dojo-text-primary tracking-tight">Voice Preview</span>
        </div>
        <button
          type="button"
          onClick={() => setChatOpen(v => !v)}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors bg-dojo-surface-raised/80 border-dojo-border/60 text-dojo-text-primary hover:border-dojo-accent/40"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">{chatOpen ? 'Hide Chat' : 'Show Chat'}</span>
        </button>
      </div>

      <div className="flex-1 relative z-10 overflow-hidden flex">
        <div className="flex-1 relative flex flex-col">
          {conversations.length === 0 && !greetingSent && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dojo-canvas/90 backdrop-blur-sm px-6">
              <div className="text-center max-w-xs">
                <div className="h-16 w-16 rounded-full bg-dojo-accent/20 mx-auto mb-4 flex items-center justify-center ring-1 ring-dojo-accent/30">
                  <Volume2 className="h-8 w-8 text-dojo-accent" />
                </div>
                <h2 className="text-lg font-bold text-dojo-text-primary mb-2">Start conversation with {CHAR_NAME}</h2>
                <p className="text-sm text-dojo-text-muted mb-6 leading-relaxed">
                  A quick preview of what real practice feels like.
                </p>
                <button
                  type="button"
                  disabled={gate.state !== 'open'}
                  onClick={() => {
                    unlockAudio();
                    setGreetingSent(true);
                    const speaker = createReplySpeaker({
                      targetBcp47: getBCP47(targetLanguage, 'tts'),
                      nativeBcp47: getNativeLangBcp47(nativeLanguage),
                      phase: 'orientation',
                      isMuted: () => mutedRef.current,
                    });
                    sendGreeting({
                      onToken: (t) => setStreamingText(t ? cleanDisplay(t) : null),
                      onTextDone: (t) => {
                        setStreamingText(null);
                        speaker.finish(cleanDisplay(t)).catch(() => {});
                      },
                    }).catch(() => setGreetingSent(false));
                  }}
                  className="flex items-center gap-3 rounded-xl bg-dojo-accent px-8 py-4 text-base font-semibold text-white shadow-lg shadow-dojo-accent/25 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
                >
                  <Volume2 className="h-5 w-5" />
                  Start conversation
                </button>
              </div>
            </div>
          )}

          <VoiceOnlyStage name={CHAR_NAME} accentColor={CHAR_COLOR} mode={avatarMode} role={CHAR_ROLE} volumeLevel={voice.volumeLevel} />

          {voice.partialTranscript && (
            <div className="absolute bottom-44 left-0 right-0 flex justify-center z-10 px-4">
              <div className="flex items-start gap-2 rounded-xl bg-dojo-surface/85 backdrop-blur-md border border-dojo-border/70 px-4 py-2.5 max-w-md shadow-lg">
                <Mic className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-0.5" />
                <p className="text-sm text-dojo-text-primary/90 italic leading-relaxed">{voice.partialTranscript}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute top-4 left-0 right-0 flex justify-center z-10 px-4">
              <p className="rounded-lg bg-dojo-danger/15 border border-dojo-danger/30 px-3 py-1.5 text-xs text-dojo-danger">{error}</p>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-8 safe-bottom z-10 px-4">
            <div className="flex items-center justify-center gap-6 sm:gap-8 rounded-2xl border border-dojo-border/60 bg-dojo-surface/80 backdrop-blur-xl px-6 sm:px-8 py-3 shadow-2xl">
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMuted(v => !v)}
                  className={`tap-target flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200 ${
                    muted
                      ? 'bg-dojo-danger/20 text-dojo-danger border-dojo-danger/40'
                      : 'bg-dojo-surface-raised border-dojo-border/60 text-dojo-text-muted hover:text-dojo-text-primary hover:border-dojo-border'
                  }`}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <span className="text-[10px] text-dojo-text-muted/60 font-medium">Mute</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onPointerDown={handleMicStart}
                  onPointerUp={voice.stop}
                  onPointerLeave={voice.stop}
                  onPointerCancel={voice.stop}
                  disabled={sending || !greetingSent}
                  aria-label={voice.isListening ? 'Stop recording' : 'Start recording'}
                  aria-pressed={voice.isListening}
                  className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 select-none ${
                    voice.isListening
                      ? 'bg-dojo-warning shadow-[0_0_32px_rgba(242,169,59,0.5)] ring-4 ring-dojo-warning/20'
                      : 'bg-dojo-accent hover:scale-105 shadow-[0_8px_24px_rgba(45,59,197,0.4)]'
                  } disabled:opacity-40`}
                  style={{ touchAction: 'none', transform: voice.isListening ? `scale(${1 + voice.volumeLevel * 0.06})` : undefined }}
                >
                  <Mic className="h-7 w-7 text-white" />
                </button>
                <span className={`text-[10px] font-bold tracking-widest uppercase transition-all duration-300 ${
                  voice.isListening ? 'text-dojo-warning animate-pulse' : 'text-dojo-text-muted/60'
                }`}>
                  {voice.isListening ? 'Listening...' : 'Hold to Speak'}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="tap-target flex h-12 w-12 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border/60 text-dojo-text-muted hover:text-dojo-text-primary hover:border-dojo-border transition-all duration-200"
                  aria-label="Open chat panel"
                >
                  <MessageSquare className="h-5 w-5" />
                </button>
                <span className="text-[10px] text-dojo-text-muted/60 font-medium">Chat</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`absolute top-0 left-0 bottom-0 z-30 w-80 max-w-[85vw] sm:w-96 flex flex-col bg-dojo-surface/95 backdrop-blur-xl border-r border-dojo-border/60 shadow-2xl transition-transform duration-300 ease-in-out ${chatOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-dojo-border/60 shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-dojo-accent" />
              <span className="text-sm font-bold text-dojo-text-primary tracking-tight">Conversation</span>
            </div>
            <button type="button" onClick={() => setChatOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-dojo-border/20 text-dojo-text-muted hover:text-dojo-text-primary transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4 overscroll-contain">
            {conversations.length === 0 && (
              <p className="text-center text-xs text-dojo-text-muted/60 py-8">No messages yet</p>
            )}
            {conversations.map((turn) => {
              const isAi = turn.speaker === 'ai';
              return (
                <div key={turn.id} className={`flex items-start gap-3 ${!isAi ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white/10" style={{ backgroundColor: isAi ? CHAR_COLOR : '#6366f1' }}>
                    {isAi ? CHAR_NAME[0] : 'U'}
                  </div>
                  <div className={`flex max-w-[80%] flex-col ${!isAi ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-center gap-2 px-1 mb-1 ${!isAi ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="text-xs font-semibold text-dojo-text-primary">{isAi ? CHAR_NAME : 'You'}</span>
                    </div>
                    <div className={`px-4 py-3 shadow-sm ${isAi ? 'rounded-2xl rounded-tl-sm bg-dojo-surface-raised/90 border border-dojo-border/60' : 'rounded-2xl rounded-tr-sm bg-dojo-accent/15 border border-dojo-accent/20'}`}>
                      <p className="text-sm text-dojo-text-primary leading-relaxed">{turn.messageTarget}</p>
                      {isAi && turn.messageNative && (
                        <p className="mt-1 text-[11px] text-dojo-text-muted italic">{turn.messageNative}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {streamingText && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white/10" style={{ backgroundColor: CHAR_COLOR }}>
                  {CHAR_NAME[0]}
                </div>
                <div className="flex max-w-[80%] flex-col items-start">
                  <div className="rounded-2xl rounded-tl-sm bg-dojo-surface-raised/90 border border-dojo-border/60 px-4 py-3 shadow-sm">
                    <p className="text-sm text-dojo-text-primary leading-relaxed">
                      {streamingText}
                      <span className="inline-block w-0.5 h-4 bg-dojo-accent ml-0.5 animate-pulse align-middle" />
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          <div className="shrink-0 border-t border-dojo-border/60 px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl bg-dojo-surface-raised/80 border border-dojo-border/60 px-3 py-1 focus-within:border-dojo-accent/40 transition-colors">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                placeholder="Type a message..."
                disabled={sending || !greetingSent}
                className="flex-1 bg-transparent border-none px-1 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted/50 outline-none"
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || sending || !greetingSent}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dojo-accent text-white disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
