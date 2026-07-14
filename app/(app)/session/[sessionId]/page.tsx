'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { AvatarViewport } from '@/components/roleplay/AvatarViewport';
import { RoleplayInputBar } from '@/components/roleplay/RoleplayInputBar';
import { RoleplaySidePanel } from '@/components/roleplay/RoleplaySidePanel';
import { ConversationBubble } from '@/components/roleplay/ConversationBubble';
import { speakWithVisemes, speak as ttsSpeak, isSpeaking as ttsIsSpeaking } from '@/lib/roleplay/tts';
import type { SkillLevel } from '@/lib/design-tokens';
import { ArrowLeft, Target, X, LogOut, Volume2, Info, ChevronRight, LayoutPanelTop } from 'lucide-react';
import { cn } from '@/lib/design-tokens';

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
  return 'linear-gradient(160deg, #050B14 0%, #0B1526 100%)';
}

export default function RoleplaySessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showSidePanel, setShowSidePanel] = useState(true);
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
  
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversations]);

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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, userRawInputJp: text }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Chat request failed');

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
      if (!ttsIsSpeaking()) setAvatarMode('idle');
    }
  }, [sessionId, sending, conversations.length]);

  const handlePause = useCallback(async () => {
    const nextStatus = session?.status === 'paused' ? 'active' : 'paused';
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      setSession((prev: any) => ({ ...prev, status: nextStatus }));
    } catch (e) { console.error('Status update failed:', e); }
  }, [sessionId, session?.status]);

  const handleEnd = useCallback(async () => {
    if (!confirm('End this session and view your evaluation?')) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      router.push(`/sessions/${sessionId}/report`);
    } catch (e) { console.error('End session failed:', e); }
  }, [sessionId, router]);

  if (loading) return (
    <div className="flex h-screen w-screen items-center justify-center bg-dojo-canvas">
      <div className="flex flex-col items-center gap-4">
         <div className="h-12 w-12 rounded-full border-4 border-dojo-accent border-t-transparent animate-spin" />
         <p className="text-dojo-text-muted text-sm font-medium animate-pulse">Entering Dojo...</p>
      </div>
    </div>
  );

  const isActive = session?.status === 'active' || session?.status === 'paused';
  const isCompleted = session?.status === 'completed';
  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Sensei';
  const charColor = character?.avatarColor ?? '#D14343';
  const domainSlug = domain?.slug ?? situation?.domainSlug ?? 'daily-life';
  const latestAiMessage = [...conversations].reverse().find(c => c.speaker === 'ai');

  return (
    <div className="flex h-screen w-screen flex-col bg-dojo-canvas text-dojo-text-primary overflow-hidden">
      {/* -- Background Layer -- */}
      <div 
        className="absolute inset-0 z-0 opacity-40 transition-all duration-1000"
        style={{ background: getDomainBackground(domainSlug) }} 
      />

      {/* -- UI Layer: Top Bar -- */}
      <div className="relative z-30 flex items-center justify-between px-4 h-16 border-b border-white/5 bg-dojo-canvas/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/home')} className="hover:bg-white/5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-4 w-px bg-white/10" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold truncate">{situation?.title ?? scenario?.title}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-dojo-text-muted font-bold tracking-widest uppercase">{charName}</span>
              <div className="h-1 w-1 rounded-full bg-dojo-text-muted/30" />
              <Badge variant={situation?.skillLevel as SkillLevel} className="text-[9px] h-4 px-1">{situation?.skillLevel}</Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn("text-dojo-text-muted", showSidePanel && "bg-white/10 text-dojo-text-primary")}
            onClick={() => setShowSidePanel(!showSidePanel)}
          >
            <LayoutPanelTop className="h-4 w-4" />
          </Button>
          <LiveBadge />
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* -- Main Canvas Area (Left/Center) -- */}
        <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* 3D Scene */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <AvatarViewport
              name={charName}
              accentColor={charColor}
              mode={avatarMode}
              emotion={latestAiMessage?.emotionTone}
              gesture={latestAiMessage?.gestureHint}
            />
          </div>

          {/* Chat Overlay */}
          <div 
            ref={scrollRef}
            className="relative z-20 flex-1 overflow-y-auto p-4 sm:p-8 space-y-2 flex flex-col custom-scrollbar pb-32"
          >
            <div className="mt-auto" /> {/* Push content to bottom */}
            {conversations.map((turn, i) => (
              <ConversationBubble
                key={i}
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
              <div className="flex gap-2 p-3 bg-white/5 border border-white/5 rounded-2xl w-fit animate-pulse">
                <div className="h-1.5 w-1.5 rounded-full bg-dojo-text-muted animate-bounce [animation-delay:-0.3s]" />
                <div className="h-1.5 w-1.5 rounded-full bg-dojo-text-muted animate-bounce [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 rounded-full bg-dojo-text-muted animate-bounce" />
              </div>
            )}
          </div>

          {/* Bottom Input bar */}
          <div className="absolute bottom-0 left-0 right-0 z-40 p-4 sm:p-8 bg-gradient-to-t from-dojo-canvas via-dojo-canvas/80 to-transparent">
             <div className="mx-auto max-w-2xl w-full">
               <RoleplayInputBar
                 onSend={handleSend}
                 onPause={handlePause}
                 disabled={!isActive || sending}
                 showTextInput={showTextInput}
                 onToggleTextInput={() => setShowTextInput(!showTextInput)}
               />
             </div>
          </div>
        </div>

        {/* -- Right: Sidebar -- */}
        <div className={cn(
          "absolute inset-y-0 right-0 z-50 w-80 bg-dojo-sidebar/95 backdrop-blur-xl border-l border-white/5 transition-transform duration-300 transform lg:relative lg:translate-x-0 lg:z-30 lg:bg-dojo-sidebar/40",
          showSidePanel ? "translate-x-0" : "translate-x-full lg:hidden"
        )}>
          <div className="h-full flex flex-col p-6">
            <RoleplaySidePanel
              goals={goals}
              completedGoals={completedGoals}
              vocabulary={vocabulary}
              situation={situation}
              scenario={scenario}
              session={session}
              isActive={isActive}
              isCompleted={isCompleted}
              onPause={handlePause}
              onEnd={handleEnd}
              onViewReport={() => router.push(`/sessions/${sessionId}/report`)}
              charName={charName}
              charColor={charColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}