'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { VoiceOnlyStage } from '@/components/roleplay/VoiceOnlyStage';

const AvatarViewport3D = dynamic(() => import('@/components/roleplay/AvatarViewport3D').then(m => ({ default: m.AvatarViewport3D })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface/80 animate-pulse">
      <div className="h-12 w-12 rounded-full bg-dojo-border" />
    </div>
  ),
});
import { EnvironmentBackdrop } from '@/components/roleplay/EnvironmentBackdrop';
import { SessionInfoPanel } from '@/components/roleplay/SessionInfoPanel';
import { ChatPanel } from '@/components/roleplay/ChatPanel';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { Badge } from '@/components/ui/Badge';
import { speakWithVisemes, speak as ttsSpeak, speakMixedText, feedStreamTts, resetStreamingTts, stopStreamingTts, setOnSpeakingChange, stop as stopTts, setVoiceGender } from '@/lib/roleplay/tts';
import { detectSpeechLang } from '@/lib/roleplay/lang-detect';
import { startContinuousRecognition, stopContinuousRecognition, ensureRecognizer } from '@/lib/roleplay/pronunciation';
import { getBCP47, getTargetLangConfig, getNativeLangName, getNativeLangBcp47 } from '@/lib/language';
import { Volume2, VolumeX, Mic, Keyboard, Settings2, X, ArrowLeft, MessageSquare, Info } from 'lucide-react';

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
  pending?: boolean;
  failed?: boolean;
  audioUrl?: string | null;
  audioStatus?: string | null;
}
interface GoalData  { id: number; sequenceOrder: number; goalText: string; goalType: string; }

function cleanDisplay(text: string): string {
  return text.replace(/【[^】]*】/g, '').trim();
}

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
  const [streamingText,   setStreamingText]   = useState<string | null>(null);
  const [greetingSent,    setGreetingSent]    = useState(false);
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
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [completedGoals,setCompletedGoals]= useState<number[]>([]);
  const [phase,         setPhase]         = useState<string>('icebreaker');
  const [isRetry,       setIsRetry]       = useState(false);
  const [celebration,   setCelebration]   = useState(false);
  const [phaseToast,    setPhaseToast]    = useState<string | null>(null);
  const [avatarEnabled, setAvatarEnabled] = useState(false);

  const PHASE_LABELS: Record<string, string> = {
    icebreaker: 'Icebreaker',
    guided: 'Guided',
    unguided: 'Immersion',
    evaluation: 'Evaluation',
    completed: 'Completed',
  };

  const PHASE_BADGE_VARIANTS: Record<string, 'accent' | 'default' | 'premium' | 'outline' | 'success'> = {
    icebreaker: 'outline',
    guided: 'accent',
    unguided: 'premium',
    evaluation: 'success',
    completed: 'success',
  };

  const recognitionRef = useRef<any>(null);
  const continuousSilenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetLangRef = useRef(targetLanguage);
  const nativeLangRef = useRef(nativeLanguage);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { nativeLangRef.current = nativeLanguage; }, [nativeLanguage]);

  // Wire speaking callback to avatar mode (drives 'talking' state from audio, not text)
  useEffect(() => {
    setOnSpeakingChange((speaking) => {
      setAvatarMode(speaking ? 'talking' : 'idle');
    });
    return () => setOnSpeakingChange(null);
  }, []);

  // Play celebration sound effect
  useEffect(() => {
    if (!celebration) return;
    try {
      const ctx = new AudioContext();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.5);
      });
    } catch {}
  }, [celebration]);

  /* ── Load session ── */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Session not found'); }
        const data = await res.json();
        setSession(data.session);
        setAvatarEnabled(data.session?.avatarEnabled === true);
        setScenario(data.scenario);
        setSituation(data.situation);
        setDomain(data.domain);
        setCharacter(data.character);

        if (data.character?.voiceType) {
          setVoiceGender(data.character.voiceType.includes('Male') ? 'Male' : 'Female');
        }

        setGoals(data.goals ?? []);
        setConversations((data.conversations ?? []).map((c: any) => ({
          id: c.id,
          turnNo: c.turnNo,
          speaker: c.speaker,
          messageTarget: cleanDisplay(c.messageTarget ?? c.messageJp),
          messageNative: c.messageNative ?? c.messageEn,
          messageRomaji: c.messageRomaji,
          emotionTone: c.emotionTone,
          gestureHint: c.gestureHint,
          corrections: c.corrections ?? [],
          audioUrl: c.audioUrl,
          audioStatus: c.audioStatus,
        })));
        if (data.goalCompletions) {
          setCompletedGoals(data.goalCompletions.map((gc: any) => gc.sequenceOrder));
        }
        if (data.session?.targetLanguage) setTargetLanguage(data.session.targetLanguage);
        if (data.session?.nativeLanguage) setNativeLanguage(data.session.nativeLanguage);
        if (data.session?.phase) setPhase(data.session.phase);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  /* ── Send turn (streaming) ── */
  const handleSend = useCallback(async (inputText: string) => {
    if (sending) return;
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Optimistic user turn — appears before the server responds
    const optimisticId = trimmed !== '__session_start__' ? Date.now() : null;
    if (optimisticId) {
      setConversations(prev => [...prev, {
        id: optimisticId,
        turnNo: prev.length + 1,
        speaker: 'user',
        messageTarget: trimmed,
        messageNative: '',
        messageRomaji: null,
        pending: true,
      }]);
    }

    setSending(true);
    setAvatarMode('listening');
    setError('');
    setSuggestedReplies([]);
    setText('');
    setStreamingText('');

    // Stop listening while AI responds
    stopContinuousRecognition();
    if (continuousSilenceRef.current) {
      clearTimeout(continuousSilenceRef.current);
      continuousSilenceRef.current = null;
    }
    setIsListening(false);

    stopTts();
    resetStreamingTts();

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userRawInput: trimmed,
          isRetryOfPreviousMistake: isRetry,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Chat request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let collectedAiText = '';
      let finalPhase: string | null = null;
      let finalRunningScore: number | null = null;
      let finalAnalysis: any = null;
      let isRetryResponse = false;

      const bcp47 = getBCP47(targetLangRef.current, 'tts');
      const nativeBcp47 = getNativeLangBcp47(nativeLangRef.current);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));

          switch (payload.type) {
            case 'token':
              collectedAiText += payload.text;
              setStreamingText(cleanDisplay(collectedAiText));
              break;

            case 'retry':
              isRetryResponse = true;
              setIsRetry(true);
              finalPhase = payload.analysis.phase;
              finalAnalysis = payload.analysis;
              break;

            case 'done':
              setIsRetry(false);
              finalPhase = payload.phase;
              finalRunningScore = payload.runningScore;
              finalAnalysis = payload.analysis;
              if (payload.celebration) setCelebration(true);
              break;

            case 'error':
              throw new Error(payload.message || 'Stream error');
          }
        }
      }

      if (isRetryResponse && finalAnalysis) {
        const userTurn: TurnData = {
          id: Date.now(), turnNo: conversations.length + 1, speaker: 'user',
          messageTarget: finalAnalysis.messageTarget ?? trimmed,
          messageNative: finalAnalysis.messageNative ?? '',
          messageRomaji: finalAnalysis.messageRomaji,
          emotionTone: finalAnalysis.emotionTone,
          gestureHint: finalAnalysis.gestureHint,
          corrections: finalAnalysis.corrections ?? [],
        };
        // Replace optimistic turn in-place
        setConversations(prev => {
          if (optimisticId === null) return [...prev, userTurn];
          const idx = prev.findIndex(t => t.id === optimisticId);
          if (idx === -1) return [...prev, userTurn];
          const updated = [...prev];
          updated[idx] = { ...userTurn, pending: false };
          return updated;
        });
        if (finalAnalysis.suggestedReplies?.length > 0) setSuggestedReplies(finalAnalysis.suggestedReplies);
        setAvatarMode('idle');
        setStreamingText(null);
        setSending(false);
        return;
      }

      if (finalPhase) {
        if (finalPhase !== phase && conversations.length > 0 && PHASE_LABELS[finalPhase]) {
          setPhaseToast(PHASE_LABELS[finalPhase]);
          setTimeout(() => setPhaseToast(null), 4000);
        }
        setPhase(finalPhase);
      }

      // For session start (__session_start__), only show the AI greeting — no user turn
      if (trimmed === '__session_start__') {
        const aiTurn: TurnData = {
          id: Date.now(), turnNo: 0, speaker: 'ai' as const,
          messageTarget: cleanDisplay(collectedAiText),
          messageNative: '',
          messageRomaji: null,
        };
        setConversations(prev => [...prev, aiTurn]);
      } else {
        const userTurn: TurnData = {
          id: Date.now(), turnNo: conversations.length + 1, speaker: 'user',
          messageTarget: finalAnalysis?.messageTarget ?? trimmed,
          messageNative: finalAnalysis?.messageNative ?? '',
          messageRomaji: finalAnalysis?.messageRomaji,
          emotionTone: finalAnalysis?.emotionTone,
          gestureHint: finalAnalysis?.gestureHint,
          corrections: finalAnalysis?.corrections ?? [],
        };
        const aiTurn: TurnData = {
          id: Date.now() + 1, turnNo: conversations.length + 1, speaker: 'ai',
          messageTarget: cleanDisplay(collectedAiText),
          messageNative: '',
          messageRomaji: null,
        };
        // Replace optimistic turn in-place, then insert AI turn after it
        setConversations(prev => {
          if (optimisticId === null) return [...prev, userTurn, aiTurn];
          const idx = prev.findIndex(t => t.id === optimisticId);
          if (idx === -1) return [...prev, userTurn, aiTurn];
          const updated = [...prev];
          updated[idx] = { ...userTurn, pending: false };
          updated.splice(idx + 1, 0, aiTurn);
          return updated;
        });
      }
      setStreamingText(null);

      if (!muted && collectedAiText) {
        const bcp47 = getBCP47(targetLangRef.current, 'tts');
        const nativeBcp47 = getNativeLangBcp47(nativeLangRef.current);
        speakMixedText(cleanDisplay(collectedAiText), bcp47, nativeBcp47, phase).catch(() => {});
      }

      if (finalAnalysis?.suggestedReplies?.length > 0) setSuggestedReplies(finalAnalysis.suggestedReplies);
      if (finalAnalysis?.goalsAddressedThisTurn?.length > 0) {
        setCompletedGoals(prev => [...new Set([...prev, ...finalAnalysis.goalsAddressedThisTurn])]);
      }

      if (finalAnalysis?.scenarioComplete) setSession((p: any) => ({ ...p, status: 'completed' }));
    } catch (e: any) {
      setError(e.message);
      setAvatarMode('idle');
      setStreamingText(null);
      // Mark optimistic turn as failed so the user's message isn't lost
      if (optimisticId) {
        setConversations(prev => prev.map(t => t.id === optimisticId ? { ...t, pending: false, failed: true } : t));
      }
    } finally {
      setSending(false);
    }
  }, [sessionId, sending, conversations.length, muted, isRetry, phase]);

  // Auto-send greeting when session starts in icebreaker phase
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  useEffect(() => {
    if (phase === 'icebreaker' && !greetingSent && !loading && !sending && conversations.length === 0) {
      setGreetingSent(true);
      handleSendRef.current('__session_start__');
    }
  }, [phase, greetingSent, loading, sending, conversations.length]);

  /* ── Pre-warm recognizer after session loads ── */
  useEffect(() => {
    if (!loading && targetLanguage) {
      const bcp47 = getBCP47(targetLanguage, 'stt');
      ensureRecognizer(bcp47).catch(() => {});
    }
  }, [loading, targetLanguage]);

  /* ── Voice input (always continuous) ── */
  const startListening = useCallback(async () => {
    if (sending || streamingText) return;
    setIsListening(true);
    setAvatarMode('listening');
    const bcp47 = getBCP47(targetLangRef.current, 'stt');
    try {
      await startContinuousRecognition(bcp47, {
        onInterim: (text: string) => {
          setText(text);
        },
        onFinal: (text: string) => {
          const trimmed = text.trim();
          if (trimmed) handleSend(trimmed);
        },
        onError: () => {
          setIsListening(false);
          setAvatarMode('idle');
        },
      });
    } catch {
      setIsListening(false);
      setAvatarMode('idle');
    }
  }, [handleSend, sending, streamingText]);

  const stopListening = useCallback(async () => {
    await stopContinuousRecognition();
    if (continuousSilenceRef.current) {
      clearTimeout(continuousSilenceRef.current);
      continuousSilenceRef.current = null;
    }
    setIsListening(false);
    setAvatarMode('idle');
  }, []);

  const handleReplay = useCallback((turn: TurnData) => {
    if (muted) return;
    const t = turn.messageTarget || turn.messageNative;
    if (!t) return;

    // Use cached audio if available
    if (turn.audioUrl) {
      const audio = new Audio(turn.audioUrl);
      setAvatarMode('talking');
      audio.play().catch(() => {
        // Fallback to TTS if cached audio fails to play
        const bcp47 = getBCP47(targetLangRef.current, 'tts');
        const nativeBcp47 = getNativeLangBcp47(nativeLangRef.current);
        speakMixedText(t, bcp47, nativeBcp47, phase);
      });
      audio.onended = () => setAvatarMode('idle');
      return;
    }

    const bcp47 = getBCP47(targetLangRef.current, 'tts');
    const nativeBcp47 = getNativeLangBcp47(nativeLangRef.current);
    setAvatarMode('talking');
    speakMixedText(t, bcp47, nativeBcp47, phase).catch(() => {
      const lang = detectSpeechLang(t, bcp47, nativeBcp47);
      return ttsSpeak(t, lang);
    });
  }, [muted, phase]);

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
  const totalCorrections = conversations.reduce((sum, c) => sum + (c.corrections?.length ?? 0), 0);
  const targetName  = getTargetLangConfig(targetLanguage).name;

  // Defensive safeguard: if a response starts while mic is open, auto-stop (consent-preserving)
  useEffect(() => {
    if (isListening && (sending || streamingText)) {
      stopListening();
    }
  }, [isListening, sending, streamingText, stopListening]);

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
    suggestedReplies,
    phase,
    streamingText: streamingText ?? undefined,
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
        │  │  Akademia AvatarViewport│      │  [ Chat ] [ Session Info ]  │
        │  │  (left half)            │      │                              │
        │  │                         │      │  ChatPanel or SessionInfo   │
        │  └─────────────────────────┘      │                              │
        │  ─── control bar ───             │                              │
        └───────────────────────────────────┴──────────────────────────────┘
     ═════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ═══════════ LEFT COLUMN: SCENE AREA ═══════════ */}
      <div className="relative w-[60%] overflow-hidden">

        {/* Environment photo backdrop fills column (absolute z-0) */}
        <EnvironmentBackdrop domainSlug={domainSlug} />

        {/* ── AI Character Visual — full width, z-10 ── */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {avatarEnabled && character?.avatarModelUrl ? (
            <AvatarViewport3D
              name={charName}
              accentColor={charColor}
              modelUrl={character?.avatarModelUrl ?? undefined}
              mode={avatarMode}
              emotion={latestAi?.emotionTone}
              gesture={latestAi?.gestureHint}
              cameraMode="front"
            />
          ) : (
            <VoiceOnlyStage
              name={charName}
              accentColor={charColor}
              mode={avatarMode}
            />
          )}
        </div>

        {/* ── Celebration overlay ── */}
        {celebration && (
          <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
            <div className="animate-bounce text-6xl sm:text-7xl drop-shadow-2xl">
              🎉
            </div>
          </div>
        )}

        {/* ── Top bar: absolute top-0 left-0 right-0, z-30 ── */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4 z-30">
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
            <Badge variant={PHASE_BADGE_VARIANTS[phase]} className="ml-2">
              {PHASE_LABELS[phase] ?? phase}
            </Badge>
            <LiveBadge />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !avatarEnabled;
                setAvatarEnabled(next);
                fetch(`/api/sessions/${sessionId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ avatarEnabled: next }),
                }).catch(() => setAvatarEnabled(!next));
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                avatarEnabled
                  ? 'bg-dojo-accent/20 border-dojo-accent text-dojo-accent'
                  : 'bg-dojo-surface-raised/80 border-dojo-border text-dojo-text-muted hover:border-dojo-text-muted'
              }`}
              title={avatarEnabled ? 'Disable avatar' : 'Enable avatar'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            <button
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-full bg-dojo-surface-raised/80 border border-dojo-border text-dojo-text-muted"
              onClick={() => { setMobileTab('chat'); setShowMobilePanel(true); }}
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Phase change toast: absolute top-16, centered, z-25 ── */}
        {phaseToast && (
          <div className="absolute top-16 left-0 right-0 z-25 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-dojo-accent/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg backdrop-blur-sm flex items-center gap-2">
              <span>Phase Complete</span>
              <span className="text-white/50">→</span>
              <span>{phaseToast}</span>
            </div>
          </div>
        )}

        {/* ── Error indicator: absolute bottom-36, centered, z-25 ── */}
        {error && (
          <div className="absolute bottom-36 left-0 right-0 z-25 flex justify-center pointer-events-none">
            <p className="text-xs text-dojo-danger bg-dojo-surface/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">{error}</p>
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
                {isListening ? 'Listening...' : 'Tap to Speak'}
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
      <aside className="hidden lg:flex w-[40%] min-w-[280px] max-w-[520px] shrink-0 flex-col border-l border-dojo-border bg-dojo-sidebar">
        <TabBar active={sidebarTab} onChange={setSidebarTab} />
        <div className="flex-1 overflow-hidden">
          {sidebarTab === 'chat' ? (
              <ChatPanel {...chatPanelProps} />
          ) : (
            <SessionInfoPanel {...sidePanelProps} />
          )}
        </div>
      </aside>

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
