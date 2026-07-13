/* ───────────────────────────────────────────────
   Roleplay Room (Panel 06) — Real room, loaded from DB
   Voice + Text input, Gemini-powered, session-backed
   Responsive: side panel hides < lg, mobile drawer
   replaces it, compact avatar on small screens.
   ─────────────────────────────────────────────── */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { AvatarStage } from '@/components/roleplay/AvatarStage';
import { ConversationBubble } from '@/components/roleplay/ConversationBubble';
import { RoleplayInputBar } from '@/components/roleplay/RoleplayInputBar';
import { RoleplaySidePanel } from '@/components/roleplay/RoleplaySidePanel';
import { speak as ttsSpeak, isSpeaking as ttsIsSpeaking } from '@/lib/roleplay/tts';
import type { SkillLevel } from '@/lib/design-tokens';
import { ArrowLeft, Target, X, LogOut } from 'lucide-react';

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

export default function RoleplaySessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [avatarMode, setAvatarMode] = useState<'idle' | 'listening' | 'talking'>('idle');

  const [session, setSession] = useState<any>(null);
  const [scenario, setScenario] = useState<any>(null);
  const [situation, setSituation] = useState<any>(null);
  const [domain, setDomain] = useState<any>(null);
  const [character, setCharacter] = useState<any>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabData[]>([]);
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [completedGoals, setCompletedGoals] = useState<number[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, sending]);

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

  const handleSend = useCallback(async (text: string) => {
    if (sending) return;
    setSending(true);
    setAvatarMode('listening');
    setError('');

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

      // Speak the AI reply via TTS
      const aiText = aiTurn.messageJp || aiTurn.messageEn;
      if (aiText) {
        setAvatarMode('talking');
        ttsSpeak(aiText, 'ja-JP').then(() => {
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
  };

  return (
    <div className="flex h-full flex-col">
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Avatar + Conversation area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Top bar ─────────────────────────── */}
          <div className="flex items-center justify-between border-b border-dojo-border px-3 sm:px-6 py-2.5 shrink-0">
            {/* Left side */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button variant="ghost" size="sm" onClick={() => router.push('/home')}>
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Exit</span>
              </Button>
              <div className="h-4 w-px bg-dojo-border shrink-0" />
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: charColor }}
              >
                {charName[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-dojo-text-primary truncate">
                  {situation?.title ?? scenario?.title ?? 'Roleplay'}
                </p>
                {/* Subtitle — hidden below sm (mobile avatar card covers it) */}
                <p className="hidden sm:block text-xs text-dojo-text-muted truncate">
                  with {charName}
                  {session?.behaviorMode ? ` · ${session.behaviorMode} mode` : ''}
                  {session?.sessionNumber ? ` · Attempt #${session.sessionNumber}` : ''}
                </p>
              </div>
            </div>

            {/* Right side — badges + mobile controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Skill level badge — hidden below sm to save space */}
              {situation?.skillLevel && (
                <div className="hidden sm:block">
                  <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
                </div>
              )}

              {/* Side panel toggle — mobile only (< lg) */}
              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setShowMobilePanel(true)}
                  title="Goals & Controls"
                >
                  <Target className="h-4 w-4" />
                </Button>
              )}

              {/* Compact End Session — mobile only (< lg) */}
              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden text-dojo-danger"
                  onClick={handleEnd}
                  title="End Session"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}

              {/* Live / Completed badge — always visible */}
              {isActive && <LiveBadge />}
              {isCompleted && <Badge variant="default">Completed</Badge>}
            </div>
          </div>

          {/* Body: avatar panel + chat */}
          <div className="flex flex-1 overflow-hidden">
            {/* Avatar panel — persistent 3D display, hidden below lg */}
            <div className="hidden lg:flex w-72 shrink-0 flex-col border-r border-dojo-border bg-dojo-sidebar/30">
              <div className="flex-1 min-h-0 p-4">
                <AvatarStage
                  name={charName}
                  role={charRole}
                  accentColor={charColor}
                  domainSlug={domainSlug}
                  mode={avatarMode}
                  state={
                    latestAiMessage
                      ? {
                          emotion: latestAiMessage.emotionTone,
                          gesture: latestAiMessage.gestureHint,
                        }
                      : undefined
                  }
                />
              </div>
              {scenario?.context && (
                <div className="border-t border-dojo-border px-4 py-3">
                  <p className="text-xs text-dojo-text-muted leading-relaxed">{scenario.context}</p>
                </div>
              )}
            </div>

            {/* Conversation + Input */}
            <div className="flex flex-1 flex-col min-w-0">
              {/* ── Compact mobile avatar card ────── */}
              <div className="lg:hidden border-b border-dojo-border px-4 py-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: charColor }}
                  >
                    {charName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dojo-text-primary">{charName}</p>
                    <p className="text-xs text-dojo-text-muted truncate">{charRole}</p>
                  </div>
                </div>
              </div>

              {/* Conversation area — centered, max-width */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-4">
                  {conversations.length === 0 && !sending && (
                    <div className="flex items-center justify-center h-32">
                      <p className="text-dojo-text-muted text-sm">
                        Start the conversation! Say something to {charName}.
                      </p>
                    </div>
                  )}

                  {conversations.map((turn) => (
                    <ConversationBubble
                      key={turn.id}
                      speaker={turn.speaker}
                      name={turn.speaker === 'ai' ? charName : 'You'}
                      accentColor={turn.speaker === 'ai' ? charColor : '#2D3BC5'}
                      messageJp={turn.messageJp}
                      messageRomaji={turn.messageRomaji}
                      messageEn={turn.messageEn}
                      emotionTone={turn.emotionTone}
                      gestureHint={turn.gestureHint}
                    />
                  ))}

                  {sending && (
                    <div className="flex gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: charColor }}
                      >
                        {charName[0]}
                      </div>
                      <div className="rounded-2xl rounded-tl-none bg-dojo-surface-raised border border-dojo-border px-4 py-3">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 rounded-full bg-dojo-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-2 w-2 rounded-full bg-dojo-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-2 w-2 rounded-full bg-dojo-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input area — centered, safe-area padding */}
              <div className="border-t border-dojo-border px-3 sm:px-6 py-3 sm:py-4 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="mx-auto max-w-2xl">
                  <RoleplayInputBar
                    onSend={handleSend}
                    onPause={handlePause}
                    disabled={!isActive || sending}
                  />
                  {error && (
                    <p className="mt-2 text-xs text-dojo-danger">{error}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Desktop side panel (Goals + Vocabulary + Controls) ── */}
        <div className="hidden lg:flex w-72 shrink-0 flex-col border-l border-dojo-border p-4 space-y-4 overflow-y-auto">
          <RoleplaySidePanel {...sidePanelProps} />
        </div>
      </div>

      {/* ── Mobile drawer (Goals + Vocabulary + Controls) ── */}
      {showMobilePanel && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobilePanel(false)}
          />
          {/* Drawer panel */}
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-dojo-canvas border-l border-dojo-border shadow-xl flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-dojo-border px-4 py-3 shrink-0">
              <h2 className="text-sm font-semibold text-dojo-text-primary">Session Details</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowMobilePanel(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <RoleplaySidePanel {...sidePanelProps} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
