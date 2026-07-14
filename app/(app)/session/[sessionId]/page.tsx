'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { AvatarViewport } from '@/components/roleplay/AvatarViewport';
import { RoleplayInputBar } from '@/components/roleplay/RoleplayInputBar';
import { RoleplaySidePanel } from '@/components/roleplay/RoleplaySidePanel';
import { speakWithVisemes, speak as ttsSpeak, isSpeaking as ttsIsSpeaking } from '@/lib/roleplay/tts';
import type { SkillLevel } from '@/lib/design-tokens';
import { ArrowLeft, Target, X, LogOut, Volume2 } from 'lucide-react';

interface TurnData {
  id: number;
  turnNo: number;
  speaker: 'user' | 'ai';
  messageJp: string;
  messageRomaji: string;
  messageEn: string;
  emotionTone?: string;
  gestureHint?: string;
}

interface GoalData {
  id: number;
  sequenceOrder: number;
  goalText: string;
  goalType: string;
}

interface VocabData {
  id: number;
  japanese: string;
  english: string;
}

const DOMAIN_BACKGROUNDS: Record<string, string> = {
  restaurant:  'linear-gradient(160deg, #1a0f0a 0%, #2d1a10 30%, #1c1814 70%, #0f0d0b 100%)',
  hotel:       'linear-gradient(160deg, #0f1a2d 0%, #1a2d40 30%, #141c24 70%, #0b0f14 100%)',
  airport:     'linear-gradient(160deg, #1a1a2e 0%, #2d2d50 30%, #1c1c30 70%, #0f0f1a 100%)',
  hospital:    'linear-gradient(160deg, #0f1a14 0%, #1a2d24 30%, #141c18 70%, #0b0f0d 100%)',
  shopping:    'linear-gradient(160deg, #1a0f1a 0%, #2d1a2d 30%, #1c141c 70%, #0f0b0f 100%)',
  business:    'linear-gradient(160deg, #0f141a 0%, #1a2430 30%, #14181c 70%, #0b0d0f 100%)',
  travel:      'linear-gradient(160deg, #0f1a1a 0%, #1a2d2d 30%, #141c1c 70%, #0b0f0f 100%)',
  daily_life:  'linear-gradient(160deg, #14140f 0%, #24241a 30%, #181814 70%, #0d0d0b 100%)',
};

function getDomainBackground(slug?: string): string {
  if (slug && DOMAIN_BACKGROUNDS[slug]) return DOMAIN_BACKGROUNDS[slug];
  return 'linear-gradient(160deg, #111D33 0%, #1C2A42 50%, #0F1628 100%)';
}

export default function RoleplaySessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [avatarMode, setAvatarMode] = useState<'idle' | 'listening' | 'talking'>('idle');
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false);

  const [session, setSession] = useState<any>(null);
  const [scenario, setScenario] = useState<any>(null);
  const [situation, setSituation] = useState<any>(null);
  const [domain, setDomain] = useState<any>(null);
  const [character, setCharacter] = useState<any>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabData[]>([]);
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [completedGoals, setCompletedGoals] = useState<number[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Session not found');
        }
        const data = await res.json();
        setSession(data.session);
        setScenario(data.scenario);
        setSituation(data.situation);
        setDomain(data.domain);
        setCharacter(data.character);
        setGoals(data.goals ?? []);
        setVocabulary(data.vocabulary ?? []);
        setConversations(data.conversations ?? []);
        if (data.goalCompletions) {
          setCompletedGoals(data.goalCompletions.map((gc: any) => gc.sequenceOrder));
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  // Poll speaking state for UI feedback
  useEffect(() => {
    const interval = setInterval(() => {
      setSpeaking(ttsIsSpeaking());
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleSend = useCallback(async (text: string) => {
    if (sending) return;
    setSending(true);
    setAvatarMode('listening');
    setError('');
    setSuggestedReplies([]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, userRawInputJp: text }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Chat request failed');
      }

      const userTurn: TurnData = {
        id: Date.now(),
        turnNo: conversations.length + 1,
        speaker: 'user',
        messageJp: text,
        messageRomaji: data.analysis.messageRomaji,
        messageEn: data.analysis.messageEn,
        emotionTone: data.analysis.emotionTone,
        gestureHint: data.analysis.gestureHint,
      };

      const aiTurn: TurnData = {
        id: Date.now() + 1,
        turnNo: conversations.length + 1,
        speaker: 'ai',
        messageJp: data.analysis.nextAiReply.japanese,
        messageRomaji: data.analysis.nextAiReply.romaji,
        messageEn: data.analysis.nextAiReply.english,
        emotionTone: data.analysis.nextAiReply.emotionTone,
        gestureHint: data.analysis.nextAiReply.gestureHint,
      };

      setConversations(prev => [...prev, userTurn, aiTurn]);

      if (data.analysis.suggestedReplies?.length > 0) {
        setSuggestedReplies(data.analysis.suggestedReplies);
      }

      const aiText = aiTurn.messageJp || aiTurn.messageEn;
      if (aiText) {
        setAvatarMode('talking');
        speakWithVisemes(aiText, 'ja-JP').catch(() => ttsSpeak(aiText, 'ja-JP')).finally(() => {
          setAvatarMode('idle');
        });
      }

      if (data.analysis.goalsAddressedThisTurn?.length > 0) {
        setCompletedGoals(prev => [...new Set([...prev, ...data.analysis.goalsAddressedThisTurn])]);
      }

      if (data.analysis.scenarioComplete) {
        setSession((prev: any) => ({ ...prev, status: 'completed' }));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
      if (!ttsIsSpeaking()) {
        setAvatarMode('idle');
      }
    }
  }, [sessionId, sending, conversations.length]);

  const handleReplay = useCallback((text: string) => {
    if (!text) return;
    setAvatarMode('talking');
    speakWithVisemes(text, 'ja-JP').catch(() => ttsSpeak(text, 'ja-JP')).finally(() => {
      setAvatarMode('idle');
    });
  }, []);

  const handlePause = useCallback(async () => {
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      setSession((prev: any) => ({ ...prev, status: 'paused' }));
    } catch (e) {
      console.error('Pause failed:', e);
    }
  }, [sessionId]);

  const handleEnd = useCallback(async () => {
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      router.push(`/sessions/${sessionId}/report`);
    } catch (e) {
      console.error('End session failed:', e);
    }
  }, [sessionId, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-dojo-text-muted">Loading session...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-dojo-text-muted mb-4">{error}</p>
          <Button variant="secondary" onClick={() => router.push('/home')}>
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const isActive = session?.status === 'active' || session?.status === 'paused';
  const isCompleted = session?.status === 'completed';
  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charRole = situation?.counterpartRole ?? character?.role ?? scenario?.aiCharacterRole ?? '';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const domainSlug = domain?.slug ?? situation?.domainSlug ?? 'daily-life';

  const latestAiMessage = [...conversations].reverse().find(c => c.speaker === 'ai');

  const sidePanelProps = {
    goals,
    completedGoals,
    vocabulary,
    situation,
    scenario,
    session,
    isActive,
    isCompleted,
    onPause: handlePause,
    onEnd: handleEnd,
    onViewReport: () => router.push(`/sessions/${sessionId}/report`),
    domain,
    character,
    charName,
    charRole,
    charColor,
  };

  return (
    <div className="flex h-full flex-col bg-dojo-canvas">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-dojo-border px-3 sm:px-6 py-2.5 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push('/home')}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Exit</span>
          </Button>
          <div className="h-4 w-px bg-dojo-border shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-dojo-text-primary truncate">
              {situation?.title ?? scenario?.title ?? 'Roleplay'}
            </p>
            <p className="hidden sm:block text-xs text-dojo-text-muted truncate">
              with {charName}{session?.behaviorMode ? ` · ${session.behaviorMode} mode` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden sm:block">
            {situation?.skillLevel && (
              <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setShowMobilePanel(true)} title="Session Info">
            <Target className="h-4 w-4" />
          </Button>
          {isCompleted && <Badge variant="default">Completed</Badge>}
          {isActive && (
            <Button variant="ghost" size="sm" className="text-dojo-danger" onClick={handleEnd} title="End Session">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Avatar canvas + chat overlay ── */}
        <div
          className="relative flex-1 flex flex-col overflow-hidden"
          style={{ background: getDomainBackground(domainSlug) }}
        >
          {/* AI avatar — full area */}
          <div className="absolute inset-0">
            <AvatarViewport
              name={charName}
              accentColor={charColor}
              mode={avatarMode}
              emotion={latestAiMessage?.emotionTone}
              gesture={latestAiMessage?.gestureHint}
            />
          </div>

          {/* User avatar — foreground corner, behind/above, dimmed */}
          <div className="absolute bottom-28 right-4 w-20 h-28 opacity-50 blur-[1px] pointer-events-none z-10">
            <AvatarViewport
              name="You"
              accentColor="#2D3BC5"
              mode="idle"
              cameraMode="over-shoulder"
            />
          </div>

          {/* Floating chat bubble — latest AI turn */}
          {latestAiMessage && (
            <div className="absolute top-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-20">
              <div className="bg-dojo-surface-raised border border-dojo-border rounded-[--radius-lg] px-4 py-3 shadow-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-dojo-text-primary">{charName}</span>
                  <button
                    onClick={() => handleReplay(latestAiMessage.messageJp || latestAiMessage.messageEn)}
                    className="text-dojo-text-muted hover:text-dojo-accent transition-colors"
                    title="Replay"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                  {latestAiMessage.emotionTone && (
                    <span className="text-[10px] text-dojo-text-muted capitalize ml-auto">
                      {latestAiMessage.emotionTone}
                    </span>
                  )}
                </div>
                <p className="text-sm text-dojo-text-primary leading-relaxed">
                  {latestAiMessage.messageJp}
                </p>
                {latestAiMessage.messageRomaji && (
                  <p className="mt-1 text-xs text-dojo-text-muted italic">{latestAiMessage.messageRomaji}</p>
                )}
                {latestAiMessage.messageEn && (
                  <p className="text-xs text-dojo-text-muted italic">{latestAiMessage.messageEn}</p>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {conversations.length === 0 && !sending && (
            <div className="absolute top-4 left-4 right-4 sm:left-6 sm:max-w-md z-20">
              <div className="bg-dojo-surface-raised border border-dojo-border rounded-[--radius-lg] px-4 py-3 shadow-lg">
                <p className="text-sm text-dojo-text-muted">
                  Start the conversation! Say something to {charName}.
                </p>
              </div>
            </div>
          )}

          {/* Sending indicator */}
          {sending && (
            <div className="absolute top-4 left-4 z-20">
              <div className="bg-dojo-surface-raised border border-dojo-border rounded-[--radius-lg] px-4 py-3 shadow-lg">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-dojo-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-dojo-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-dojo-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Suggested reply chips */}
          {suggestedReplies.length > 0 && (
            <div className="absolute bottom-20 left-4 right-4 sm:left-6 sm:right-auto z-20">
              <p className="text-xs text-dojo-text-muted mb-2">You can say:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(reply)}
                    disabled={sending}
                    className="rounded-[--radius-pill] border border-dojo-border bg-dojo-surface px-3 py-1.5 text-xs text-dojo-text-primary hover:border-dojo-accent transition-colors disabled:opacity-50"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute bottom-20 left-4 z-20">
              <p className="text-xs text-dojo-danger">{error}</p>
            </div>
          )}

          {/* Speaking indicator */}
          {speaking && (
            <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                <span className="h-3 w-0.5 rounded-full bg-dojo-accent animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="h-4 w-0.5 rounded-full bg-dojo-accent animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="h-3 w-0.5 rounded-full bg-dojo-accent animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] text-dojo-text-muted">Speaking...</span>
            </div>
          )}

          {/* Control bar */}
          <div className="absolute bottom-0 left-0 right-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-dojo-canvas/80 to-transparent">
            <div className="mx-auto max-w-md">
              <RoleplayInputBar
                onSend={handleSend}
                onPause={handlePause}
                disabled={!isActive || sending}
                showTextInput={showTextInput}
                onToggleTextInput={() => setShowTextInput(v => !v)}
              />
            </div>
          </div>
        </div>

        {/* ── Right: Session Information panel ── */}
        <div className="hidden lg:flex w-72 shrink-0 flex-col border-l border-dojo-border p-4 space-y-4 overflow-y-auto bg-dojo-sidebar">
          <RoleplaySidePanel {...sidePanelProps} />
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {showMobilePanel && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobilePanel(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-dojo-canvas border-l border-dojo-border shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-dojo-border px-4 py-3 shrink-0">
              <h2 className="text-sm font-semibold text-dojo-text-primary">Session Details</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowMobilePanel(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <RoleplaySidePanel {...sidePanelProps} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
