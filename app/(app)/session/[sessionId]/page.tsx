'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AvatarViewport } from '@/components/roleplay/AvatarViewport';
import { EnvironmentBackdrop } from '@/components/roleplay/EnvironmentBackdrop';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { Badge } from '@/components/ui/Badge';
import { speakWithVisemes, speak as ttsSpeak } from '@/lib/roleplay/tts';
import { behaviorModeClass, type SkillLevel } from '@/lib/design-tokens';
import { getBCP47, getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { Volume2, VolumeX, Mic, Keyboard, Settings2, X, Target, ArrowLeft, Flag } from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface TurnData {
  id: number;
  turnNo: number;
  speaker: 'user' | 'ai';
  messageTarget: string;
  messageNative: string;
  messageRomaji: string | null;
  emotionTone?: string;
  gestureHint?: string;
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

/* ─── Session Info panel (right column) ─────────────────────────────────── */
function SessionInfoPanel({
  domain, situation, scenario, session, character,
  charName, charColor, goals, completedGoals, isActive, isCompleted,
  onEnd, onViewReport, targetLanguage, nativeLanguage,
}: {
  domain: any; situation: any; scenario: any; session: any; character: any;
  charName: string; charColor: string;
  goals: GoalData[]; completedGoals: number[];
  isActive: boolean; isCompleted: boolean;
  onEnd: () => void; onViewReport: () => void;
  targetLanguage?: string; nativeLanguage?: string;
}) {
  const primaryGoal =
    situation?.learningGoals ?? scenario?.learningGoals ?? '';
  const targetName = targetLanguage ? getTargetLangConfig(targetLanguage).name : '';
  const nativeName = nativeLanguage ? getNativeLangName(nativeLanguage) : '';

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-4 border-b border-dojo-border shrink-0">
        <p className="text-sm font-semibold text-dojo-text-primary">Session Information</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-0">
        <div className="space-y-3 text-sm">
          {domain?.name && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Scenario</span>
              <span className="text-dojo-text-primary font-medium text-right capitalize">
                {domain.name.replace('_', ' ')}
              </span>
            </div>
          )}
          {(situation?.title ?? scenario?.title) && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Situation</span>
              <span className="text-dojo-text-primary font-medium text-right">
                {situation?.title ?? scenario?.title}
              </span>
            </div>
          )}

          {/* Target Language */}
          {targetName && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Target</span>
              <span className="text-dojo-text-primary font-medium text-right">{targetName}</span>
            </div>
          )}

          {/* Native Language */}
          {nativeName && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Native</span>
              <span className="text-dojo-text-primary font-medium text-right">{nativeName}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-dojo-text-muted shrink-0">Characters</span>
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-dojo-border overflow-hidden"
                style={{ backgroundColor: charColor }}
              >
                <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${charName}&backgroundColor=${charColor.replace('#','')}`} alt={charName} className="h-full w-full object-cover" />
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border text-[9px] font-medium text-dojo-text-muted">
                U
              </span>
            </div>
          </div>

          {session?.behaviorMode && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Difficulty</span>
              <span
                className={`px-2.5 py-0.5 rounded-[--radius-pill] text-[11px] font-medium border ${
                  behaviorModeClass[session.behaviorMode as keyof typeof behaviorModeClass] ??
                  behaviorModeClass.standard
                }`}
              >
                {session.behaviorMode === 'trouble' ? 'Trouble' : 'Standard'}
              </span>
            </div>
          )}

          {situation?.skillLevel && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-dojo-text-muted shrink-0">Skill Level</span>
              <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
            </div>
          )}
        </div>

        {primaryGoal && (
          <div className="mt-4 pt-4 border-t border-dojo-border">
            <div className="flex items-start gap-2">
              <Flag className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-0.5" />
              <p className="text-xs text-dojo-text-muted leading-relaxed">{primaryGoal}</p>
            </div>
          </div>
        )}

        {goals.length > 0 && (
          <div className="mt-4 pt-4 border-t border-dojo-border space-y-2">
            {goals.map((goal) => {
              const done = completedGoals.includes(goal.sequenceOrder);
              return (
                <div key={goal.id} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      done ? 'bg-dojo-success text-white' : 'border border-dojo-border text-dojo-text-muted'
                    }`}
                  >
                    {done ? '✓' : goal.sequenceOrder}
                  </span>
                  <span className={`text-[11px] leading-relaxed ${done ? 'text-dojo-success line-through' : 'text-dojo-text-primary'}`}>
                    {goal.goalText}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-dojo-border space-y-2 shrink-0">
        {isActive && (
          <button
            onClick={onEnd}
            className="w-full rounded-[--radius-md] border border-dojo-danger/40 bg-dojo-danger/10 py-2 text-sm font-medium text-dojo-danger hover:bg-dojo-danger/20 transition-colors"
          >
            End Session
          </button>
        )}
        {isCompleted && (
          <button
            onClick={onViewReport}
            className="w-full rounded-[--radius-md] bg-dojo-accent py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            View Report
          </button>
        )}
      </div>
    </div>
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
  const [showTextInput,   setShowTextInput]   = useState(false);
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

  const recognitionRef = useRef<any>(null);
  const targetLangRef = useRef(targetLanguage);

  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);

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
  const targetName  = getTargetLangConfig(targetLanguage).name;
  const targetNativeName = getTargetLangConfig(targetLanguage).nativeName;

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
    onEnd: handleEnd,
    onViewReport: () => router.push(`/sessions/${sessionId}/report`),
  };

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     Layout:
       ┌─────────────────────────────────┬────────────────┐
       │  SCENE AREA (flex-1)            │  INFO PANEL    │
       │  ┌──────────┐  ┌────────────┐  │  (w-72 fixed)  │
       │  │ AI avatar│  │speech+chips│  │                │
       │  │ (waist-up│  │            │  │                │
       │  │ left-40%)│  │            │  │                │
       │  └──────────┘  └────────────┘  │                │
       │     [user over-shoulder, right] │                │
       │  ─── control bar ───           │                │
       └─────────────────────────────────┴────────────────┘
     ═════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ═══════════ LEFT COLUMN: SCENE AREA ═══════════ */}
      <div className="relative flex-1 overflow-hidden">

        {/* Environment photo backdrop fills column (absolute z-0) */}
        <EnvironmentBackdrop domainSlug={domainSlug} />

        {/* ── AI avatar canvas — absolute inset-y-0 left-0, width 46%, z-10 ── */}
        <div className="absolute inset-y-0 left-0 w-[46%] z-10 pointer-events-none">
          <AvatarViewport
            name={charName}
            accentColor={charColor}
            mode={avatarMode}
            emotion={latestAi?.emotionTone}
            gesture={latestAi?.gestureHint}
            cameraMode="front"
          />
        </div>

        {/* ── User over-shoulder: inset-y-0 right-0 w-[34%], z-10, opacity-90, blur-[3px] ──
             Full-height panel mirrored from the AI avatar's left-side layout, at 34% width
             so the user appears as a tall blurred over-the-shoulder figure in the foreground
             right panel, matching the session_design mockup. */}
        <div
          className="absolute inset-y-0 right-0 w-[34%] z-10 pointer-events-none opacity-90 blur-[3px]"
        >
          <AvatarViewport
            name="You"
            accentColor="#2D3BC5"
            mode="idle"
            cameraMode="over-shoulder"
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
              onClick={() => setShowMobilePanel(true)}
            >
              <Target className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Speech bubble: absolute top-14 left-[44%] right-3, z-20 ── */}
        <div className="absolute top-14 left-[44%] right-3 z-20 space-y-3">
          {sending ? (
            <div className="bg-dojo-surface-raised/88 backdrop-blur-md rounded-xl border border-dojo-border shadow-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-dojo-text-primary">{charName} (AI)</span>
                <span className="text-[10px] text-dojo-text-muted">typing…</span>
              </div>
            </div>
          ) : latestAi ? (
            <div className="bg-dojo-surface-raised/88 backdrop-blur-md rounded-xl border border-dojo-border shadow-2xl px-4 py-3 max-w-lg">
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

        {/* ── Text input row ── */}
        {showTextInput && (
          <div className="absolute bottom-24 left-4 right-4 z-40">
            <div className="mx-auto flex max-w-lg items-center gap-2 rounded-[--radius-lg] border border-dojo-border bg-dojo-surface/90 backdrop-blur-md p-2 shadow-xl">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(text); }
                }}
                placeholder={`Type in ${targetName}…`}
                disabled={sending || !isActive}
                autoFocus
                className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted outline-none disabled:opacity-50"
              />
              <button
                onClick={() => handleSend(text)}
                disabled={!text.trim() || sending || !isActive}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[--radius-md] bg-dojo-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"
              >
                ↵
              </button>
            </div>
          </div>
        )}

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
                onClick={() => setShowTextInput(v => !v)}
                className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                  showTextInput
                    ? 'border-dojo-accent bg-dojo-accent/20 text-dojo-accent shadow-[0_0_15px_rgba(45,59,197,0.3)]'
                    : 'border-white/10 bg-white/5 backdrop-blur-md text-white/70 hover:text-white hover:border-white/30 hover:bg-white/10'
                }`}
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

      {/* ═══════════ RIGHT COLUMN (w-[272px] shrink-0) ═══════════ */}
      <aside className="hidden lg:flex w-[272px] shrink-0 flex-col border-l border-dojo-border bg-dojo-sidebar">
        <SessionInfoPanel {...sidePanelProps} />
      </aside>

      {/* ═══════════ MOBILE SLIDE-IN PANEL ═══════════ */}
      {showMobilePanel && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobilePanel(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[80vw] max-w-sm bg-dojo-sidebar border-l border-dojo-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-dojo-border px-4 py-3 shrink-0">
              <p className="text-sm font-semibold text-dojo-text-primary">Session Information</p>
              <button onClick={() => setShowMobilePanel(false)}>
                <X className="h-4 w-4 text-dojo-text-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SessionInfoPanel {...sidePanelProps} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
