'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AvatarMicOverlay } from '@/components/roleplay/AvatarMicOverlay';
import { ConnectionLatencyIndicator, useLatencyMonitor } from '@/components/roleplay/ConnectionLatencyIndicator';
import { useRoleplaySession } from '@/lib/hooks/useRoleplaySession';
import { speakMixedText, stop as stopTts, resetStreamingTts, setOnSpeakingChange } from '@/lib/roleplay/tts';
import { getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { ArrowLeft, MessageSquare, Volume2, VolumeX } from 'lucide-react';
import { AvatarViewport3D } from '@/components/roleplay/AvatarViewport3D';
import { ConversationBubble } from '@/components/roleplay/ConversationBubble';

export default function AvatarModePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const {
    session, scenario, character, conversations, phase,
    loading, error, isActive,
    submitTurnStream, sendGreeting,
  } = useRoleplaySession(sessionId);

  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [avatarMode, setAvatarMode] = useState<'idle' | 'listening' | 'talking'>('idle');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const targetLangRef = useRef('ja');
  const nativeLangRef = useRef('en');
  const phaseRef = useRef('');
  const sendingRef = useRef(false);
  const lastAiCompletedRef = useRef<number>(Date.now());
  const { status: connectionStatus } = useLatencyMonitor();

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { nativeLangRef.current = nativeLanguage; }, [nativeLanguage]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (session?.targetLanguage) setTargetLanguage(session.targetLanguage);
    if (session?.nativeLanguage) setNativeLanguage(session.nativeLanguage);
  }, [session]);

  // Wire speaking state to avatar
  useEffect(() => {
    setOnSpeakingChange((speaking) => {
      setAvatarMode(speaking ? 'talking' : 'idle');
      if (!speaking) lastAiCompletedRef.current = Date.now();
    });
    return () => setOnSpeakingChange(null);
  }, []);

  // Auto-greeting
  useEffect(() => {
    if (phase === 'icebreaker' && !greetingSent && !loading && !sending && conversations.length === 0) {
      setGreetingSent(true);
      sendGreeting().catch(() => {});
    }
  }, [phase, greetingSent, loading, sending, conversations.length, sendGreeting]);

  const handleFinalTranscript = useCallback(async (text: string) => {
    if (sendingRef.current || !text.trim()) return;
    sendingRef.current = true;
    setSending(true);
    const responseTimeMs = Date.now() - lastAiCompletedRef.current;
    stopTts();
    resetStreamingTts();

    let fullText = '';

    try {
      await submitTurnStream(text.trim(), {
        responseTimeMs,
        onToken: (t) => {
          if (t) fullText = t;
          setStreamingText(t ? cleanDisplay(t) : null);
        },
        onCelebration: () => {},
      });
      setStreamingText(null);

      const cleaned = cleanDisplay(fullText);
      if (!mutedRef.current && cleaned) {
        speakMixedText(
          cleaned,
          getBCP47(targetLangRef.current, 'tts'),
          getNativeLangBcp47(nativeLangRef.current),
          phaseRef.current,
        ).catch(() => {});
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [submitTurnStream]);

  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const avatarModelUrl = character?.avatarModelUrl ?? scenario?.avatarModelUrl;

  function cleanDisplay(text: string): string {
    return text.replace(/【[^】]*】/g, '').trim();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-dojo-text-muted text-sm">Loading session…</div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="text-dojo-text-muted text-sm">{error}</p>
        <button onClick={() => router.push('/home')} className="text-sm text-dojo-accent">Back to Home</button>
      </div>
    );
  }

  const latestConvo = conversations.length > 0 ? conversations[conversations.length - 1] : null;

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#0a0a1a] via-[#0d0d24] to-[#111128]">
      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/home')} className="text-dojo-text-muted hover:text-dojo-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-dojo-text-primary">{scenario?.title ?? 'Avatar'}</span>
          <ConnectionLatencyIndicator status={connectionStatus} className="ml-2" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(v => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border ${muted ? 'border-dojo-danger text-dojo-danger' : 'border-white/10 text-dojo-text-muted'}`}
          >
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
          <button
            onClick={() => router.push(`/session/${sessionId}/chat`)}
            className="text-xs text-dojo-text-muted hover:text-dojo-accent flex items-center gap-1"
          >
            <MessageSquare className="h-3 w-3" /> Chat
          </button>
        </div>
      </div>

      {/* Avatar + chat area */}
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
        <AvatarViewport3D
          name={charName}
          accentColor={charColor}
          mode={avatarMode}
          modelUrl={avatarModelUrl}
          cameraMode="front"
        />

        {/* Chat bubble above overlay */}
        {latestConvo && latestConvo.speaker === 'ai' && (
          <div className="absolute top-4 left-4 right-4 max-w-md mx-auto">
            <ConversationBubble
              speaker="ai"
              name={charName}
              accentColor={charColor}
              messageJp={streamingText ?? latestConvo.messageTarget ?? latestConvo.messageNative ?? ''}
              messageRomaji={latestConvo.messageRomaji ?? undefined}
              messageEn=""
            />
          </div>
        )}
      </div>

      {/* Mic overlay at the bottom */}
      <AvatarMicOverlay
        targetLanguage={targetLanguage}
        onFinalTranscript={handleFinalTranscript}
        isAiResponding={avatarMode === 'talking'}
        muted={muted}
        onMuteToggle={() => setMuted(v => !v)}
      />
    </div>
  );
}
