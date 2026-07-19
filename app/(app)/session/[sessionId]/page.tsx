'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AvatarCreator, getStoredAvatarUrl } from '@/components/roleplay/AvatarCreator';
import { EnvironmentBackdrop } from '@/components/roleplay/EnvironmentBackdrop';
import { SessionInfoPanel } from '@/components/roleplay/SessionInfoPanel';
import { ChatPanel } from '@/components/roleplay/ChatPanel';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { speakWithVisemes, speak as ttsSpeak } from '@/lib/roleplay/tts';
import { getBCP47, getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { useUser } from '@/lib/auth/user-context';
import { useCurrentAvatarModel } from '@/lib/auth/avatar-context';
import { Volume2, VolumeX, Mic, Keyboard, Settings2, X, ArrowLeft, MessageSquare, Info } from 'lucide-react';

const SessionStage = dynamic(() => import('@/components/roleplay/avatar-variants/SessionStage').then(m => ({ default: m.SessionStage })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-lg">
      <div className="h-16 w-16 rounded-full bg-dojo-border" />
    </div>
  ),
});

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface CorrectionTip {
  correctionType: string;
  originalText: string;
  correctedText: string;
  originalRomaji?: string | null;
  correctedRomaji?: string | null;
  explanation: string;
  severity: string;
}
interface TurnData {
  id: number;
  turnNo: number;
  speaker: 'user' | 'ai';
  messageTarget: string;
  messageNative: string;
  messageRomaji: string | null;
  emotionTone?: string;
  gestureHint?: string;
  corrections?: CorrectionTip[];
}
interface GoalData  { id: number; sequenceOrder: number; goalText: string; goalType: string; }
interface VocabData { id: number; japanese: string; english: string; }

/* ─── Mic pulse rings ────────────────────────────────────────────────────── */
function MicPulse({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      <span className="absolute inset-0 rounded-full bg-dojo-danger/30 animate-ping" />
      <span className="absolute inset-0 rounded-full bg-dojo-danger/20 animate-pulse" />
    </>
  );
}

/* ─── Speaking wave dots next to character name ─────────────────────────── */
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

/* ═══════════════════════════════════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════════════════════════════════ */
export default function RoleplaySessionPage() {
  const params   = useParams();
  const router   = useRouter();
  const sessionId = Number(params.sessionId);

  /* ── State ── */
  const [loading,         setLoading]         = useState(true);
  const [sending,         setSending]         = useState(false);
  const [error,           setError]           = useState('');
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [mobileTab,       setMobileTab]       = useState<'chat' | 'info'>('chat');
  const [sidebarTab,      setSidebarTab]      = useState<'chat' | 'info'>('chat');
  const [isListening,     setIsListening]     = useState(false);
  const [muted,           setMuted]           = useState(false);
  const [avatarMode,      setAvatarMode]      = useState<'idle' | 'listening' | 'talking'>('idle');
  const [suggestedReplies,setSuggestedReplies]= useState<string[]>([]);
  const [text,            setText]            = useState('');

  const [targetLanguage,  setTargetLanguage]  = useState('ja');
  const [nativeLanguage,  setNativeLanguage]  = useState('en');
  const [session,       setSession]       = useState<any>(null);
  const [scenario,      setScenario]      = useState<any>(null);
  const [situation,     setSituation]     = useState<any>(null);
  const [domain,        setDomain]        = useState<any>(null);
  const [character,     setCharacter]     = useState<any>(null);
  const [goals,         setGoals]         = useState<GoalData[]>([]);
  const [vocabulary,    setVocabulary]    = useState<VocabData[]>([]);
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [completedGoals,setCompletedGoals]= useState<number[]>([]);

  const user = useUser();
  const currentAvatarModelUrl = useCurrentAvatarModel();
  const recognitionRef = useRef<any>(null);
  const targetLangRef = useRef(targetLanguage);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [avatarModelUrl, setAvatarModelUrl] = useState<string | undefined>(undefined);
  const [showAvatarCreator, setShowAvatarCreator] = useState(false);

  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);

  useEffect(() => {
    const stored = getStoredAvatarUrl();
    if (stored) setAvatarModelUrl(stored);
  }, []);

  const resolvedModelUrl = character?.avatarModelUrl ?? avatarModelUrl ?? undefined;

  useEffect(() => {
    if (resolvedModelUrl) {
      import('@react-three/drei').then(m => m.useGLTF.preload(resolvedModelUrl));
    }
    if (currentAvatarModelUrl ?? user?.avatarSrc) {
      import('@react-three/drei').then(m => m.useGLTF.preload(currentAvatarModelUrl ?? user?.avatarSrc!));
    }
  }, [resolvedModelUrl, currentAvatarModelUrl, user?.avatarSrc]);

  /* ── Load session ── */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Session not found'); }
        const data = await res.json();
        setSession(data.session);
        setScenario(data.scenario);
        setSituation(data.situation);
        setDomain(data.domain);
        setCharacter(data.character);

        setGoals(data.goals ?? []);
        setVocabulary(data.vocabulary ?? []);
        setConversations((data.conversations ?? []).map((c: any) => ({
          id: c.id,
          turnNo: c.turnNo,
          speaker: c.speaker,
          messageTarget: c.messageTarget ?? c.messageJp,
          messageNative: c.messageNative ?? c.messageEn,
          messageRomaji: c.messageRomaji,
          emotionTone: c.emotionTone,
          gestureHint: c.gestureHint,
          corrections: c.corrections ?? [],
        })));
        if (data.goalCompletions) {
          setCompletedGoals(data.goalCompletions.map((gc: any) => gc.sequenceOrder));
        }
        if (data.session?.targetLanguage) setTargetLanguage(data.session.targetLanguage);
        if (data.session?.nativeLanguage) setNativeLanguage(data.session.nativeLanguage);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  /* ── Send turn ── */
  const handleSend = useCallback(async (inputText: string) => {
    if (sending) return;
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setSending(true);
    setAvatarMode('listening');
    setError('');
    setSuggestedReplies([]);
    setText('');

    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, userRawInput: trimmed }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Chat request failed');

      const userTurn: TurnData = {
        id: Date.now(), turnNo: conversations.length + 1, speaker: 'user',
        messageTarget: data.analysis.messageTarget ?? trimmed,
        messageNative: data.analysis.messageNative ?? '',
        messageRomaji: data.analysis.messageRomaji,
        emotionTone: data.analysis.emotionTone,
        gestureHint: data.analysis.gestureHint,
        corrections: data.analysis.corrections ?? [],
      };
      const aiTurn: TurnData = {
        id: Date.now() + 1, turnNo: conversations.length + 1, speaker: 'ai',
        messageTarget: data.analysis.nextAiReply.target,
        messageNative: data.analysis.nextAiReply.native,
        messageRomaji: data.analysis.nextAiReply.romaji,
        emotionTone: data.analysis.nextAiReply.emotionTone,
        gestureHint: data.analysis.nextAiReply.gestureHint,
      };

      setConversations(prev => [...prev, userTurn, aiTurn]);
      if (data.analysis.suggestedReplies?.length > 0) setSuggestedReplies(data.analysis.suggestedReplies);
      if (data.analysis.goalsAddressedThisTurn?.length > 0) {
        setCompletedGoals(prev => [...new Set([...prev, ...data.analysis.goalsAddressedThisTurn])]);
      }

      const bcp47 = getBCP47(targetLangRef.current, 'tts');
      const aiText = aiTurn.messageTarget || aiTurn.messageNative;
      if (aiText && !muted) {
        setAvatarMode('talking');
        speakWithVisemes(aiText, bcp47)
          .catch(() => ttsSpeak(aiText, bcp47))
          .finally(() => setAvatarMode('idle'));
      } else {
        setAvatarMode('idle');
      }

      if (data.analysis.scenarioComplete) setSession((p: any) => ({ ...p, status: 'completed' }));
    } catch (e: any) {
      setError(e.message);
      setAvatarMode('idle');
    } finally {
      setSending(false);
    }
  }, [sessionId, sending, conversations.length, muted]);

  /* ── Voice input ── */
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = getBCP47(targetLangRef.current, 'stt');
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => { setIsListening(false); handleSend(e.results[0][0].transcript); };
    rec.onerror  = () => setIsListening(false);
    rec.onend    = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
    setAvatarMode('listening');
  }, [handleSend]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const handleReplay = useCallback((msgTarget: string, msgNative: string) => {
    if (muted) return;
    const t = msgTarget || msgNative;
    if (!t) return;
    const bcp47 = getBCP47(targetLangRef.current, 'tts');
    setAvatarMode('talking');
    speakWithVisemes(t, bcp47).catch(() => ttsSpeak(t, bcp47)).finally(() => setAvatarMode('idle'));
  }, [muted]);

  const handleTypeClick = useCallback(() => {
    if (window.innerWidth < 1024) {
      setMobileTab('chat');
      setShowMobilePanel(true);
    } else {
      setSidebarTab('chat');
      chatInputRef.current?.focus();
    }
  }, []);

  const handleEnd = useCallback(async () => {
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    }).catch(console.error);
    router.push(`/sessions/${sessionId}/report`);
  }, [sessionId, router]);

  const handlePause = useCallback(async () => {
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    }).catch(console.error);
    setSession((p: any) => ({ ...p, status: 'paused' }));
  }, [sessionId]);

  /* ── Derived ── */
  const isActive    = session?.status === 'active' || session?.status === 'paused';
  const isCompleted = session?.status === 'completed';
  const charName    = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor   = character?.avatarColor ?? '#2D3BC5';
  const domainSlug  = domain?.slug ?? situation?.domainSlug ?? 'daily-life';
  const latestAi    = [...conversations].reverse().find(c => c.speaker === 'ai');
  const latestUser  = [...conversations].reverse().find(c => c.speaker === 'user');
  const totalCorrections = conversations.reduce((sum, c) => sum + (c.corrections?.length ?? 0), 0);
  const targetName  = getTargetLangConfig(targetLanguage).name;

  /* ── Loading / error states ── */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-dojo-text-muted text-sm">Loading session…</div>
      </div>
    );
  }
  if (error && !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-dojo-text-muted text-sm">{error}</p>
        <button onClick={() => router.push('/home')} className="flex items-center gap-1.5 text-sm text-dojo-accent">
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </button>
      </div>
    );
  }

  const sidePanelProps = {
    domain, situation, scenario, session, character,
    charName, charColor, goals, completedGoals,
    isActive, isCompleted,
    targetLanguage, nativeLanguage,
    correctionCount: totalCorrections,
    onEnd: handleEnd,
    onViewReport: () => router.push(`/sessions/${sessionId}/report`),
  };

  const chatPanelProps = {
    conversations,
    charName,
    charColor,
    avatarMode,
    text,
    setText,
    onSend: handleSend,
    onReplay: handleReplay,
    sending,
    isActive,
    targetName,
  };

  /* ── Shared tab bar ── */
  function TabBar({ active, onChange }: { active: 'chat' | 'info'; onChange: (t: 'chat' | 'info') => void }) {
    return (
      <div className="flex border-b border-dojo-border shrink-0" role="tablist">
        <button
          role="tab"
          aria-selected={active === 'chat'}
          onClick={() => onChange('chat')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
            active === 'chat' ? 'text-dojo-text-primary' : 'text-dojo-text-muted hover:text-dojo-text-primary'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
          {active === 'chat' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-dojo-accent" />}
        </button>
        <button
          role="tab"
          aria-selected={active === 'info'}
          onClick={() => onChange('info')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
            active === 'info' ? 'text-dojo-text-primary' : 'text-dojo-text-muted hover:text-dojo-text-primary'
          }`}
        >
          <Info className="h-4 w-4" />
          Session Info
          {active === 'info' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-dojo-accent" />}
        </button>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     Layout:
       ┌───────────────────────────────────┬──────────────────────────────┐
       │  SCENE AREA (w-[60%])             │  SIDEBAR (w-[40%])           │
       │                                   │  min-w-[280px] max-w-[420px] │
       │  ┌─────────────────────────┐      │                              │
       │  │  SessionStage           │      │  [ Chat ] [ Session Info ]  │
       │  │  (merged canvas)        │      │                              │
       │  │                         │      │  ChatPanel or SessionInfo   │
       │  └─────────────────────────┘      │                              │
       │  ─── speech bubble ───            │                              │
       │  ─── control bar ───             │                              │
       └───────────────────────────────────┴──────────────────────────────┘
     ═════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ═══════════ LEFT COLUMN: SCENE AREA ═══════════ */}
      <div className="relative w-[60%] overflow-hidden">

        {/* Environment photo backdrop fills column (absolute z-0) */}
        <EnvironmentBackdrop domainSlug={domainSlug} />

        {/* ── Merged avatar canvas — single SessionStage z-10 ── */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <SessionStage
            ai={{
              modelUrl: resolvedModelUrl,
              mode: avatarMode,
              emotion: latestAi?.emotionTone,
              gesture: latestAi?.gestureHint,
              cameraIntent: 'face-partner-left',
            }}
            user={{
              modelUrl: currentAvatarModelUrl ?? user?.avatarSrc ?? undefined,
              mode: isListening ? 'talking' : 'idle',
              cameraIntent: 'face-partner-right',
            }}
          />
        </div>

        {/* ── Top bar: absolute top-0 left-0 right-0, z-30 ── */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-30">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => router.push('/home')}
              className="flex items-center gap-1.5 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-dojo-text-primary">
              {situation?.title ?? scenario?.title ?? 'Roleplay in Progress'}
            </span>
            <LiveBadge />
          </div>
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-full bg-dojo-surface-raised/80 border border-dojo-border text-dojo-text-muted"
              onClick={() => { setMobileTab('chat'); setShowMobilePanel(true); }}
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Speech bubble overlay: absolute top-14 right-3, z-20 ── */}
        <div className="absolute top-14 left-4 right-4 z-20 flex justify-center">
          <div className="w-full max-w-lg space-y-3">
            {sending ? (
              <div className="bg-dojo-surface-raised/88 backdrop-blur-md rounded-xl border border-dojo-border shadow-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-dojo-text-primary">{charName} (AI)</span>
                  <span className="text-[10px] text-dojo-text-muted">typing…</span>
                </div>
              </div>
            ) : latestAi ? (
              <>
                {latestUser && (
                  <div className="bg-dojo-surface/80 backdrop-blur-md rounded-xl border border-dojo-border/60 shadow-lg px-4 py-3 ml-auto max-w-md">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold text-dojo-text-muted">You</span>
                      {latestUser.corrections && latestUser.corrections.length > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-dojo-warning/20 px-2 py-0.5 text-[10px] font-semibold text-dojo-warning">
                          {latestUser.corrections.length} tip{latestUser.corrections.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-dojo-text-primary leading-relaxed">
                      {latestUser.messageTarget}
                    </p>
                    {latestUser.corrections && latestUser.corrections.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-t border-dojo-border/40 pt-2">
                        {latestUser.corrections.map((tip, i) => (
                          <div key={i} className="text-[11px] leading-relaxed">
                            <div className="flex items-start gap-1.5">
                              <span className={`shrink-0 mt-0.5 inline-block h-3.5 w-3.5 rounded-full text-[8px] font-bold text-center leading-[14px] ${
                                tip.severity === 'major' ? 'bg-dojo-danger/20 text-dojo-danger' :
                                tip.severity === 'moderate' ? 'bg-dojo-warning/20 text-dojo-warning' :
                                'bg-dojo-accent/20 text-dojo-accent'
                              }`}>
                                {tip.severity === 'major' ? '!' : tip.severity === 'moderate' ? '!' : 'i'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="line-through text-dojo-text-muted">{tip.originalText}</span>
                                {' '}→{' '}
                                <span className="font-medium text-dojo-text-primary">{tip.correctedText}</span>
                                {tip.correctedRomaji && (
                                  <span className="ml-1 italic text-dojo-text-muted">({tip.correctedRomaji})</span>
                                )}
                                <p className="text-dojo-text-muted/80 mt-0.5">{tip.explanation}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="bg-dojo-surface-raised/88 backdrop-blur-md rounded-xl border border-dojo-border shadow-2xl px-4 py-3 max-w-md">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-dojo-text-primary">{charName} (AI)</span>
                    <SpeakingWave active={avatarMode === 'talking'} />
                    <button
                      onClick={() => handleReplay(latestAi.messageTarget, latestAi.messageNative)}
                      className="ml-auto"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-dojo-text-muted hover:text-dojo-text-primary transition-colors" />
                    </button>
                  </div>
                  <p className="text-sm text-dojo-text-primary leading-relaxed font-medium">
                    {latestAi.messageTarget}
                  </p>
                  {latestAi.messageRomaji && (
                    <p className="mt-1 text-[11px] text-dojo-text-muted italic">{latestAi.messageRomaji}</p>
                  )}
                  {latestAi.messageNative && (
                    <p className="text-[11px] text-dojo-text-muted mt-1">{latestAi.messageNative}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-dojo-surface-raised/88 backdrop-blur-md rounded-xl border border-dojo-border shadow-2xl px-4 py-3">
                <p className="text-sm text-dojo-text-muted">
                  Speak or type to begin the conversation with {charName}.
                </p>
              </div>
            )}

            {suggestedReplies.length > 0 && !sending && (
              <div>
                <p className="text-[11px] text-dojo-text-muted mb-2 font-medium">You can say:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedReplies.map((reply, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(reply)}
                      disabled={sending || !isActive}
                      className="rounded-full border border-dojo-border bg-dojo-surface-raised/80 backdrop-blur-sm px-3 py-1.5 text-xs text-dojo-text-primary hover:border-dojo-accent transition-colors disabled:opacity-40"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-dojo-danger">{error}</p>
            )}
          </div>
        </div>

        {/* ── Control bar: absolute bottom-0 left-0 right-0, z-30 ── */}
        <div className="absolute bottom-0 left-0 right-0 z-30">
          <div
            className="pb-6 pt-10 flex items-center justify-center gap-6 sm:gap-10"
            style={{
              background: 'linear-gradient(to top, rgba(8,12,24,0.95) 40%, rgba(8,12,24,0.7) 70%, transparent)',
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setMuted(v => !v)}
                className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                  muted
                    ? 'border-dojo-danger bg-dojo-danger/20 text-dojo-danger shadow-[0_0_15px_rgba(209,67,67,0.3)]'
                    : 'border-white/10 bg-white/5 backdrop-blur-md text-white/70 hover:text-white hover:border-white/30 hover:bg-white/10'
                }`}
              >
                {muted ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Mute</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                <MicPulse active={isListening} />
                <button
                  onMouseDown={startListening}
                  onMouseUp={stopListening}
                  onMouseLeave={stopListening}
                  onTouchStart={(e) => { e.preventDefault(); startListening(); }}
                  onTouchEnd={stopListening}
                  disabled={!isActive || sending}
                  className={`relative flex h-16 w-16 sm:h-[76px] sm:w-[76px] items-center justify-center rounded-full transition-all duration-300 ${
                    isListening
                      ? 'bg-dojo-danger scale-110 shadow-[0_0_30px_rgba(209,67,67,0.6)] ring-4 ring-dojo-danger/20'
                      : 'bg-dojo-accent hover:scale-105 shadow-[0_10px_25px_rgba(45,59,197,0.5)] border-4 border-white/10'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Mic className="h-7 w-7 sm:h-9 sm:w-9 text-white" />
                </button>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isListening ? 'text-dojo-danger' : 'text-dojo-accent'}`}>
                {isListening ? 'Listening...' : 'Hold to Talk'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleTypeClick}
                className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 border-white/10 bg-white/5 backdrop-blur-md text-white/70 hover:text-white hover:border-white/30 hover:bg-white/10 transition-all duration-200"
              >
                <Keyboard className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Type</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handlePause}
                className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 border-white/10 bg-white/5 backdrop-blur-md text-white/70 hover:text-white hover:border-white/30 hover:bg-white/10 transition-all duration-200"
              >
                <Settings2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Settings</span>
            </div>
          </div>
        </div>
      </div>
      {/* ═══════════ END LEFT COLUMN ═══════════ */}

      {/* ═══════════ RIGHT COLUMN (w-[40%] min-w-[280px] max-w-[420px]) ═══════════ */}
      <aside className="hidden lg:flex w-[40%] min-w-[280px] max-w-[420px] shrink-0 flex-col border-l border-dojo-border bg-dojo-sidebar">
        <TabBar active={sidebarTab} onChange={setSidebarTab} />
        <div className="flex-1 overflow-hidden">
          {sidebarTab === 'chat' ? (
            <ChatPanel {...chatPanelProps} />
          ) : (
            <SessionInfoPanel {...sidePanelProps} />
          )}
        </div>
      </aside>

      {/* ═══════════ AVATURN CREATOR MODAL ═══════════ */}
      {showAvatarCreator && (
        <AvatarCreator
          onExport={(result) => {
            setAvatarModelUrl(result.url);
            setShowAvatarCreator(false);
          }}
          onClose={() => setShowAvatarCreator(false)}
        />
      )}

      {/* ═══════════ MOBILE SLIDE-IN PANEL ═══════════ */}
      {showMobilePanel && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobilePanel(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[80vw] max-w-sm bg-dojo-sidebar border-l border-dojo-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-dojo-border shrink-0">
              <TabBar active={mobileTab} onChange={setMobileTab} />
              <button onClick={() => setShowMobilePanel(false)} className="mr-3">
                <X className="h-4 w-4 text-dojo-text-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {mobileTab === 'chat' ? (
                <ChatPanel {...chatPanelProps} />
              ) : (
                <SessionInfoPanel {...sidePanelProps} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
