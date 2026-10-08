'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mic, Volume2, VolumeX, MessageSquare, X, Send, Sparkles, LoaderIcon } from 'lucide-react';
import { VoiceOnlyStage } from '@/components/roleplay/VoiceOnlyStage';
import { AvatarViewport3D, DEFAULT_AVATAR_MODEL_URL } from '@/components/roleplay/AvatarViewport3D';
import { usePushToTalk } from '@/lib/hooks/usePushToTalk';
import { useOnboardingPracticeSession } from '@/lib/hooks/useOnboardingPracticeSession';
import { stop as stopTts, setOnSpeakingChange, unlockAudio, clearTurnCache } from '@/lib/roleplay/tts';
import { createReplySpeaker } from '@/lib/roleplay/reply-speech';
import { getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { cleanDisplay } from '@/lib/roleplay/clean-display';
import { displayedUtterance } from '@/lib/roleplay/conversation-history';
import { colors } from '@/lib/design-tokens';
import {
  practiceChatStartsOpen,
  practiceSurface,
  type PracticeSituation,
} from '@/lib/onboarding/practice-shared';
import type { OnboardingState } from '@/lib/onboarding/context';

interface OnboardingPracticeProps {
  state: OnboardingState;
  /** False until wizard answers have been read from sessionStorage. */
  hydrated: boolean;
  preview: boolean;
  finishing: boolean;
  onBack: () => void;
  onFinish: () => void;
}

export function OnboardingPractice({ state, hydrated, preview, finishing, onBack, onFinish }: OnboardingPracticeProps) {
  const domainId = state.preferredDomainId;
  const surface = practiceSurface(state.preferredMode);
  const [situation, setSituation] = useState<PracticeSituation | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!domainId) return;
    let cancelled = false;
    fetch(
      `/api/onboarding/situation?domainId=${domainId}&level=${encodeURIComponent(state.level || 'beginner')}&targetLanguage=${encodeURIComponent(state.targetLanguage)}`,
      { credentials: 'include' },
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.situation) setSituation(data.situation as PracticeSituation);
        else setLoadError(data?.error || 'Could not load a situation for this domain.');
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load a situation for this domain.');
      });
    return () => { cancelled = true; };
  }, [domainId, state.level, state.targetLanguage]);

  if (!hydrated && !domainId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dojo-canvas">
        <LoaderIcon className="h-6 w-6 animate-spin text-dojo-accent" />
      </div>
    );
  }

  if (!domainId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-dojo-canvas p-6">
        <p className="text-sm text-dojo-text-muted">Pick a domain first so we know what to practise.</p>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-dojo-accent">
          Back to setup
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-dojo-canvas p-6">
        <p className="text-sm text-dojo-text-muted">{loadError}</p>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-dojo-accent">
          Back to setup
        </button>
      </div>
    );
  }

  if (!situation) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-dojo-canvas">
        <LoaderIcon className="h-6 w-6 animate-spin text-dojo-accent" />
      </div>
    );
  }

  return (
    <OnboardingPracticeSession
      key={`${domainId}-${state.level}-${state.preferredMode}-${state.targetLanguage}-${state.nativeLanguage}`}
      domainId={domainId}
      level={state.level || 'beginner'}
      targetLanguage={state.targetLanguage}
      nativeLanguage={state.nativeLanguage}
      surface={surface}
      chatStartsOpen={practiceChatStartsOpen(state.preferredMode)}
      situation={situation}
      preview={preview}
      finishing={finishing}
      onBack={onBack}
      onFinish={onFinish}
    />
  );
}

function OnboardingPracticeSession({
  domainId,
  level,
  targetLanguage,
  nativeLanguage,
  surface,
  chatStartsOpen,
  situation,
  preview,
  finishing,
  onBack,
  onFinish,
}: {
  domainId: number;
  level: string;
  targetLanguage: string;
  nativeLanguage: string;
  surface: 'voice' | 'avatar';
  chatStartsOpen: boolean;
  situation: PracticeSituation;
  preview: boolean;
  finishing: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { conversations, sending, limitReached, completed, error, submitTurnStream, sendGreeting } =
    useOnboardingPracticeSession({ domainId, level, targetLanguage, nativeLanguage });

  const [avatarMode, setAvatarMode] = useState<'idle' | 'listening' | 'talking'>('idle');
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(chatStartsOpen);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(false);
  const characterName = situation.characterName;

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) stopTts();
  }, [muted]);

  useEffect(() => {
    setOnSpeakingChange((speaking) => setAvatarMode(speaking ? 'talking' : 'idle'));
    return () => { setOnSpeakingChange(null); stopTts(); clearTurnCache(); };
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
        onTextDone: (t: string) => {
          setStreamingText(null);
          return speaker.finish(cleanDisplay(t)).catch(() => {});
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

  const voice = usePushToTalk({ lang: getBCP47(targetLanguage, 'stt'), onFinal: handleUserUtterance });

  if (completed || limitReached) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-dojo-canvas/95 px-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-dojo-border bg-dojo-surface-raised p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dojo-accent/15 ring-1 ring-dojo-accent/30">
            <Sparkles className="h-7 w-7 text-dojo-accent" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-dojo-text-primary">Nice work!</h1>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
            That was a short icebreaker for {situation.title}. Your full library is ready when you are.
          </p>
          <button
            type="button"
            disabled={finishing}
            onClick={onFinish}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 disabled:opacity-50"
          >
            {finishing ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
            {preview ? 'Return to start' : 'Continue to AI DOJO'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="mt-3 block w-full text-xs font-medium text-dojo-text-muted hover:text-dojo-text-primary"
          >
            Change setup and try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-dojo-canvas">
      <div className="relative z-20 flex items-center justify-between gap-2 border-b border-dojo-border/60 bg-dojo-surface/50 px-4 py-3 backdrop-blur-md sm:px-6 shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden text-sm font-medium sm:inline">Change setup</span>
          </button>
          <span className="truncate text-sm font-bold tracking-tight text-dojo-text-primary">{situation.title}</span>
          {preview && (
            <span className="hidden shrink-0 text-xs font-medium text-dojo-text-muted sm:inline">Preview</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-dojo-border/60 bg-dojo-surface-raised/80 px-3 py-2 text-xs font-semibold text-dojo-text-primary transition-colors hover:border-dojo-accent/40"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">{chatOpen ? 'Hide Chat' : 'Show Chat'}</span>
        </button>
      </div>

      <div className="relative z-10 flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col">
          {conversations.length === 0 && !greetingSent && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dojo-canvas/90 px-6 backdrop-blur-sm">
              <div className="max-w-xs text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dojo-accent/20 ring-1 ring-dojo-accent/30">
                  <Volume2 className="h-8 w-8 text-dojo-accent" />
                </div>
                <h2 className="mb-2 text-lg font-bold text-dojo-text-primary">
                  Start with {characterName}
                </h2>
                <p className="mb-6 text-sm leading-relaxed text-dojo-text-muted">
                  A few key {situation.domainName.toLowerCase()} phrases with {characterName} — no scene yet.
                </p>
                <button
                  type="button"
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
                        return speaker.finish(cleanDisplay(t)).catch(() => {});
                      },
                    }).catch(() => setGreetingSent(false));
                  }}
                  className="inline-flex items-center gap-3 rounded-xl bg-dojo-accent px-8 py-4 text-base font-semibold text-white shadow-lg shadow-dojo-accent/25 transition-all hover:opacity-90 active:scale-95"
                >
                  <Volume2 className="h-5 w-5" />
                  Start conversation
                </button>
                <button
                  type="button"
                  onClick={onFinish}
                  className="mt-4 block w-full text-xs font-medium text-dojo-text-muted hover:text-dojo-text-primary"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {surface === 'avatar' ? (
            <div className="relative flex flex-1 items-center justify-center">
              <AvatarViewport3D
                name={characterName}
                accentColor={colors.accent}
                mode={avatarMode}
                modelUrl={DEFAULT_AVATAR_MODEL_URL}
                cameraMode="front"
              />
            </div>
          ) : (
            <VoiceOnlyStage
              name={characterName}
              accentColor={colors.accent}
              mode={avatarMode}
              role={situation.characterRole}
              volumeLevel={voice.volumeLevel}
            />
          )}

          {voice.partialTranscript && (
            <div className="absolute bottom-44 left-0 right-0 z-10 flex justify-center px-4">
              <div className="flex max-w-md items-start gap-2 rounded-xl border border-dojo-border/70 bg-dojo-surface/85 px-4 py-2.5 shadow-lg backdrop-blur-md">
                <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dojo-warning" />
                <p className="text-sm italic leading-relaxed text-dojo-text-primary/90">{voice.partialTranscript}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute top-4 left-0 right-0 z-10 flex justify-center px-4">
              <p className="rounded-lg border border-dojo-danger/30 bg-dojo-danger/15 px-3 py-1.5 text-xs text-dojo-danger">{error}</p>
            </div>
          )}

          <div className={`absolute bottom-0 left-0 right-0 z-10 flex justify-center px-4 pb-8 safe-bottom ${surface === 'avatar' ? 'pointer-events-none' : ''}`}>
            <div className={`flex items-center justify-center gap-6 rounded-2xl px-6 py-3 sm:gap-8 sm:px-8 ${
              surface === 'avatar'
                ? 'pointer-events-auto border border-white/10 bg-black/10 backdrop-blur-[2px]'
                : 'border border-dojo-border/60 bg-dojo-surface/80 shadow-2xl backdrop-blur-xl'
            }`}>
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!muted) stopTts();
                    setMuted((v) => !v);
                  }}
                  className={`tap-target flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200 ${
                    muted
                      ? 'border-dojo-danger/40 bg-dojo-danger/20 text-dojo-danger'
                      : surface === 'avatar'
                        ? 'border-white/15 bg-black/40 text-white/80 hover:bg-black/60 hover:text-white'
                        : 'border-dojo-border/60 bg-dojo-surface-raised text-dojo-text-muted hover:border-dojo-border hover:text-dojo-text-primary'
                  }`}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <span className={`text-xs font-medium ${surface === 'avatar' ? 'text-white/70 drop-shadow-sm' : 'text-dojo-text-muted'}`}>Mute</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  {...voice.buttonProps}
                  disabled={sending || !greetingSent}
                  aria-label={voice.isListening ? 'Stop recording' : 'Start recording'}
                  aria-pressed={voice.isListening}
                  className={`relative flex h-16 w-16 select-none items-center justify-center rounded-full transition-all duration-300 ${
                    voice.isListening
                      ? 'bg-dojo-warning shadow-[0_0_32px_rgba(242,169,59,0.5)] ring-4 ring-dojo-warning/20'
                      : 'bg-dojo-accent shadow-[0_8px_24px_rgba(45,59,197,0.4)] hover:scale-105'
                  } disabled:opacity-40`}
                  style={{ ...voice.buttonProps.style, transform: voice.isListening ? `scale(${1 + voice.volumeLevel * 0.06})` : undefined }}
                >
                  <Mic className="h-7 w-7 text-white" />
                </button>
                <span className={`text-xs font-bold uppercase tracking-widest transition-all duration-300 ${
                  voice.isListening ? 'animate-pulse text-dojo-warning' : surface === 'avatar' ? 'text-white/70 drop-shadow-sm' : 'text-dojo-text-muted'
                }`}>
                  {voice.isListening ? 'Listening...' : 'Hold to Speak'}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className={`tap-target flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200 ${
                    surface === 'avatar'
                      ? 'border-white/15 bg-black/40 text-white/80 hover:bg-black/60 hover:text-white'
                      : 'border-dojo-border/60 bg-dojo-surface-raised text-dojo-text-muted hover:border-dojo-border hover:text-dojo-text-primary'
                  }`}
                  aria-label="Open chat panel"
                >
                  <MessageSquare className="h-5 w-5" />
                </button>
                <span className={`text-xs font-medium ${surface === 'avatar' ? 'text-white/70 drop-shadow-sm' : 'text-dojo-text-muted'}`}>Chat</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`absolute top-0 bottom-0 left-0 z-30 flex w-80 max-w-[85vw] flex-col border-r border-dojo-border/60 bg-dojo-surface/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-in-out sm:w-96 ${chatOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex shrink-0 items-center justify-between border-b border-dojo-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-dojo-accent" />
              <span className="text-sm font-bold tracking-tight text-dojo-text-primary">Conversation</span>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-dojo-text-muted transition-colors hover:bg-dojo-border/20 hover:text-dojo-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
            {conversations.length === 0 && (
              <p className="py-8 text-center text-sm text-dojo-text-muted">No messages yet</p>
            )}
            {conversations.map((turn) => {
              const isAi = turn.speaker === 'ai';
              return (
                <div key={turn.id} className={`flex items-start gap-3 ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white shadow-md ring-2 ring-white/10"
                    style={{ backgroundColor: isAi ? colors.accent : colors.idle }}
                  >
                    {isAi ? characterName[0] : 'U'}
                  </div>
                  <div className={`flex max-w-[80%] flex-col ${isAi ? 'items-start' : 'items-end'}`}>
                    <span className="mb-1 px-1 text-xs font-semibold text-dojo-text-primary">{isAi ? characterName : 'You'}</span>
                    <div className={`px-4 py-3 shadow-sm ${isAi ? 'rounded-2xl rounded-tl-sm border border-dojo-border/60 bg-dojo-surface-raised/90' : 'rounded-2xl rounded-tr-sm border border-dojo-accent/20 bg-dojo-accent/15'}`}>
                      <p className="text-base leading-relaxed text-dojo-text-primary">{displayedUtterance(turn)}</p>
                      {isAi && turn.messageNative && (
                        <p className="mt-1 text-sm italic leading-relaxed text-dojo-text-muted">{turn.messageNative}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {streamingText && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ring-2 ring-white/10" style={{ backgroundColor: colors.accent }}>
                  {characterName[0]}
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-dojo-border/60 bg-dojo-surface-raised/90 px-4 py-3 shadow-sm">
                  <p className="text-base leading-relaxed text-dojo-text-primary">
                    {streamingText}
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-dojo-accent align-middle" />
                  </p>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          <div className="shrink-0 border-t border-dojo-border/60 px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-dojo-border/60 bg-dojo-surface-raised/80 px-3 py-1 transition-colors focus-within:border-dojo-accent/40">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                placeholder="Type a message..."
                disabled={sending || !greetingSent}
                className="flex-1 border-none bg-transparent px-1 py-2 text-sm text-dojo-text-primary outline-none placeholder:text-dojo-text-muted"
              />
              <button
                type="button"
                onClick={handleChatSend}
                disabled={!chatInput.trim() || sending || !greetingSent}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dojo-accent text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-30"
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
