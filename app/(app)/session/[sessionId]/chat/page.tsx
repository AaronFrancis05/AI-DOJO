'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChatPanel } from '@/components/roleplay/ChatPanel';
import { RoleplayInputBar } from '@/components/roleplay/RoleplayInputBar';
import { useRoleplaySession } from '@/lib/hooks/useRoleplaySession';
import { getTargetLangConfig, getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { speakMixedText, stop as stopTts, resetStreamingTts, setOnSpeakingChange } from '@/lib/roleplay/tts';
import { ArrowLeft, MessageSquare, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export default function ChatOnlyPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const {
    session, scenario, character, conversations, phase,
    loading, error, isActive, isCompleted, goals, completedGoals,
    submitTurnStream, sendGreeting,
  } = useRoleplaySession(sessionId);

  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [muted, setMuted] = useState(false);
  const lastAiCompletedRef = useRef<number>(Date.now());

  useEffect(() => {
    if (session?.targetLanguage) setTargetLanguage(session.targetLanguage);
    if (session?.nativeLanguage) setNativeLanguage(session.nativeLanguage);
  }, [session]);

  useEffect(() => {
    setOnSpeakingChange((speaking) => {
      if (!speaking) lastAiCompletedRef.current = Date.now();
    });
    return () => setOnSpeakingChange(null);
  }, []);

  useEffect(() => {
    if (phase === 'icebreaker' && !greetingSent && !loading && !sending && conversations.length === 0) {
      setGreetingSent(true);
      sendGreeting().catch(() => {});
    }
  }, [phase, greetingSent, loading, sending, conversations.length, sendGreeting]);

  const handleSend = useCallback(async (text: string) => {
    if (sending || !text.trim()) return;
    setSending(true);
    setStreamingText('');
    setSuggestedReplies([]);
    stopTts();
    resetStreamingTts();

    const responseTimeMs = text !== '__session_start__' ? Date.now() - lastAiCompletedRef.current : 0;

    try {
      await submitTurnStream(text, {
        responseTimeMs,
        onToken: (t) => setStreamingText(t ? cleanDisplay(t) : null),
        onRetry: (analysis) => {
          setSuggestedReplies(analysis.suggestedReplies ?? []);
        },
        onPhaseChange: () => {},
        onCelebration: () => {},
      });
      setStreamingText(null);
    } catch (e: any) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }, [sending, submitTurnStream]);

  const handleReplay = useCallback((turn: any) => {
    if (muted) return;
    const t = turn.messageTarget || turn.messageNative;
    if (!t) return;
    const bcp47 = getBCP47(targetLanguage, 'tts');
    speakMixedText(t, bcp47, targetLanguage === nativeLanguage ? bcp47 : getNativeLangBcp47(nativeLanguage), phase).catch(() => {});
  }, [muted, targetLanguage, nativeLanguage, phase]);

  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const targetName = getTargetLangConfig(targetLanguage).name;

  const latestAi = [...conversations].reverse().find(c => c.speaker === 'ai');

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

  function cleanDisplay(text: string): string {
    return text.replace(/【[^】]*】/g, '').trim();
  }

  const chatPanelProps = {
    conversations,
    charName,
    charColor,
    avatarMode: streamingText ? ('talking' as const) : ('idle' as const),
    text: '',
    setText: () => {},
    onSend: handleSend,
    onReplay: handleReplay,
    sending,
    isActive,
    targetName,
    suggestedReplies,
    phase,
    streamingText: streamingText ?? undefined,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dojo-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/home')} className="text-dojo-text-muted hover:text-dojo-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-dojo-text-primary">{scenario?.title ?? 'Chat'}</span>
          <Badge variant="outline">{phase}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/session/${sessionId}/voice`)}
            className="text-xs text-dojo-text-muted hover:text-dojo-accent flex items-center gap-1"
          >
            <Volume2 className="h-3 w-3" /> Voice
          </button>
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel {...chatPanelProps} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-3 border-t border-dojo-border">
        <RoleplayInputBar
          onSend={(t) => {
            handleSend(t);
          }}
          onPause={() => {
            fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) }).catch(() => {});
          }}
          disabled={!isActive || sending}
          showTextInput={true}
        />
      </div>
    </div>
  );
}
