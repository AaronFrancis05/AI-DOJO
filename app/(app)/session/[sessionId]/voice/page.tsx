'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { VoiceOnlyStage } from '@/components/roleplay/VoiceOnlyStage';
import { ConnectionLatencyIndicator, useLatencyMonitor } from '@/components/roleplay/ConnectionLatencyIndicator';
import { useVoiceInput } from '@/lib/hooks/useVoiceInput';
import { useRoleplaySession } from '@/lib/hooks/useRoleplaySession';
import { speakMixedText, stop as stopTts, resetStreamingTts, setOnSpeakingChange } from '@/lib/roleplay/tts';
import { getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { ArrowLeft, MessageSquare, Volume2, VolumeX } from 'lucide-react';

export default function VoiceOnlyPage() {
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
  const lastAiCompletedRef = useRef<number>(Date.now());
  const { status: connectionStatus } = useLatencyMonitor();

  useEffect(() => {
    if (session?.targetLanguage) setTargetLanguage(session.targetLanguage);
    if (session?.nativeLanguage) setNativeLanguage(session.nativeLanguage);
  }, [session]);

  // Wire speaking state
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

  const bcp47 = getBCP47(targetLanguage, 'stt');

  const voice = useVoiceInput({
    lang: bcp47,
    onFinal: async (text: string) => {
      if (sending || !text.trim()) return;
      setSending(true);
      const responseTimeMs = Date.now() - lastAiCompletedRef.current;
      stopTts();
      resetStreamingTts();

      try {
        await submitTurnStream(text.trim(), {
          responseTimeMs,
          onToken: (t) => setStreamingText(t ? cleanDisplay(t) : null),
          onCelebration: () => {},
        });
        setStreamingText(null);

        // Speak the AI response
        if (!muted) {
          const latestAi = [...conversations].reverse().find(c => c.speaker === 'ai');
          const aiText = latestAi?.messageTarget || streamingText || '';
          if (aiText) {
            speakMixedText(
              cleanDisplay(aiText),
              getBCP47(targetLanguage, 'tts'),
              getNativeLangBcp47(nativeLanguage),
              phase,
            ).catch(() => {});
          }
        }
      } catch (e: any) {
        console.error(e);
      } finally {
        setSending(false);
      }
    },
  });

  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor = character?.avatarColor ?? '#2D3BC5';

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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dojo-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/home')} className="text-dojo-text-muted hover:text-dojo-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-dojo-text-primary">{scenario?.title ?? 'Voice'}</span>
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

      {/* Voice orb area */}
      <div className="flex-1 relative overflow-hidden">
        <VoiceOnlyStage
          name={charName}
          accentColor={charColor}
          mode={avatarMode}
        />

        {/* Live caption */}
        {voice.partialTranscript && (
          <div className="absolute bottom-32 left-0 right-0 flex justify-center">
            <div className="px-4 py-2 rounded-xl bg-dojo-surface/80 backdrop-blur-md border border-dojo-border border-dashed max-w-md">
              <p className="text-sm text-dojo-text-primary/70 italic">{voice.partialTranscript}</p>
            </div>
          </div>
        )}

        {/* Mic button */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-8">
          <div className="relative">
            {voice.isListening && (
              <>
                <span className="absolute inset-0 rounded-full bg-dojo-warning/30 animate-ping" />
                <span className="absolute inset-0 rounded-full bg-dojo-warning/20 animate-pulse" />
              </>
            )}
            <button
              onMouseDown={voice.start}
              onMouseUp={voice.stop}
              onMouseLeave={voice.stop}
              onTouchStart={(e) => { e.preventDefault(); voice.start(); }}
              onTouchEnd={voice.stop}
              disabled={!isActive || sending}
              className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 ${
                voice.isListening
                  ? 'bg-dojo-warning scale-110 shadow-[0_0_30px_rgba(242,169,59,0.6)] ring-4 ring-dojo-warning/20'
                  : 'bg-dojo-accent hover:scale-105 shadow-[0_10px_25px_rgba(45,59,197,0.5)]'
              } disabled:opacity-40`}
            >
              <Volume2 className="h-7 w-7 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
