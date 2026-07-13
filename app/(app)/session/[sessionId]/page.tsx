/* ───────────────────────────────────────────────
   Roleplay Room (Panel 06) — Real room, loaded from DB
   Voice + Text input, Gemini-powered, session-backed
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
import type { SkillLevel } from '@/lib/design-tokens';
import { ArrowLeft, Target, Lightbulb } from 'lucide-react';

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
  const charRole = character?.role ?? scenario?.aiCharacterRole ?? '';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const domainSlug = domain?.slug ?? situation?.domainSlug ?? 'daily-life';

  const latestAiMessage = [...conversations].reverse().find(c => c.speaker === 'ai');

  return (
    <div className="flex h-full flex-col">
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Avatar + Conversation area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-dojo-border px-6 py-2.5 shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => router.push('/home')}>
                <ArrowLeft className="h-4 w-4" />
                Exit
              </Button>
              <div className="h-4 w-px bg-dojo-border" />
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: charColor }}
              >
                {charName[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-dojo-text-primary">
                  {situation?.title ?? scenario?.title ?? 'Roleplay'}
                </p>
                <p className="text-xs text-dojo-text-muted">
                  with {charName} · {session?.behaviorMode ?? 'standard'} mode
                  {session?.sessionNumber ? ` · Attempt #${session.sessionNumber}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {situation?.skillLevel && (
                <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
              )}
              {isActive && <LiveBadge />}
              {isCompleted && <Badge variant="default">Completed</Badge>}
            </div>
          </div>

          {/* Body: avatar panel + chat */}
          <div className="flex flex-1 overflow-hidden">
            {/* Avatar panel — persistent 3D display */}
            <div className="hidden lg:flex w-72 shrink-0 flex-col border-r border-dojo-border bg-dojo-sidebar/30">
              <div className="flex-1 min-h-0 p-4">
                <AvatarStage
                  name={charName}
                  role={charRole}
                  accentColor={charColor}
                  domainSlug={domainSlug}
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
              {/* Conversation area — centered, max-width like old chat */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl px-6 py-6 space-y-4">
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

              {/* Input area — centered */}
              <div className="border-t border-dojo-border px-6 py-4 shrink-0">
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

        {/* Sidebar — Goals + Vocabulary + Controls */}
        <div className="w-72 border-l border-dojo-border p-4 space-y-4 overflow-y-auto">
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-dojo-accent" />
              <h3 className="text-xs font-semibold text-dojo-text-muted uppercase tracking-wider">Goals</h3>
            </div>
            {goals.length === 0 ? (
              <p className="text-xs text-dojo-text-muted">
                {situation?.learningGoals ?? scenario?.learningGoals ?? 'Practice the conversation naturally.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {goals.map((goal) => {
                  const done = completedGoals.includes(goal.sequenceOrder);
                  return (
                    <li key={goal.id} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                          done ? 'bg-dojo-success text-white' : 'border border-dojo-border text-dojo-text-muted'
                        }`}
                      >
                        {done ? '✓' : goal.sequenceOrder}
                      </span>
                      <span className={`text-xs ${done ? 'text-dojo-success line-through' : 'text-dojo-text-primary'}`}>
                        {goal.goalText}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {vocabulary.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-dojo-warning" />
                <h3 className="text-xs font-semibold text-dojo-text-muted uppercase tracking-wider">Key Vocabulary</h3>
              </div>
              <div className="space-y-2">
                {vocabulary.map((v) => (
                  <div key={v.id} className="flex justify-between text-xs">
                    <span className="text-dojo-text-primary font-medium">{v.japanese}</span>
                    <span className="text-dojo-text-muted">{v.english}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {isActive && (
              <Button variant="secondary" size="sm" className="w-full" onClick={handlePause}>
                Pause Session
              </Button>
            )}
            {session?.status === 'paused' && (
              <Button variant="primary" size="sm" className="w-full" onClick={() => handlePause()}>
                Resume Session
              </Button>
            )}
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-dojo-danger"
                onClick={handleEnd}
              >
                End Session
              </Button>
            )}
            {isCompleted && (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => router.push(`/sessions/${sessionId}/report`)}
              >
                View Report
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
