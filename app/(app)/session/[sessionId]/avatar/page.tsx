'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AvatarViewport3D, DEFAULT_AVATAR_MODEL_URL } from '@/components/roleplay/AvatarViewport3D';
import { preloadAnimationClips } from '@/components/roleplay/three/AnimationManager';
import { AvatarCaptionsOverlay } from '@/components/roleplay/AvatarCaptionsOverlay';
import { EmotionSystem } from '@/components/roleplay/three/EmotionSystem';
import { PhaseIndicator } from '@/components/roleplay/PhaseIndicator';
import { SessionModeTabs } from '@/components/roleplay/SessionModeTabs';
import { SessionInfoDrawer } from '@/components/roleplay/SessionInfoDrawer';
import { VoiceCoachPanel } from '@/components/roleplay/VoiceCoachPanel';
import { ConnectionLatencyIndicator, useLatencyMonitor } from '@/components/roleplay/ConnectionLatencyIndicator';
import { useVoiceInput } from '@/lib/hooks/useVoiceInput';
import { useRoleplaySessionContext } from '@/lib/hooks/RoleplaySessionContext';
import type { TurnData } from '@/lib/hooks/useRoleplaySession';
import { speakMixedText, stop as stopTts, setOnSpeakingChange, unlockAudio, speakWhenAudioUnlocked, setVoiceGender } from '@/lib/roleplay/tts';
import { useAvatarCaptions } from '@/lib/hooks/useAvatarCaptions';
import { CelebrationOverlay } from '@/components/roleplay/CelebrationOverlay';
import type { CelebrationVariant } from '@/components/roleplay/CelebrationOverlay';
import { PhaseTransitionCard } from '@/components/roleplay/PhaseTransitionCard';
import { LessonCompleteScreen } from '@/components/roleplay/LessonCompleteScreen';
import { LessonIncompleteScreen } from '@/components/roleplay/LessonIncompleteScreen';
import { buildSessionMetrics, buildWhatWentWrong } from '@/lib/roleplay/session-metrics';
import { computeCompositeScore } from '@/lib/roleplay/phase-engine';
import { EnvironmentBackdrop } from '@/components/roleplay/EnvironmentBackdrop';
import { getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { cleanDisplay } from '@/lib/roleplay/clean-display';
import { cn } from '@/lib/design-tokens';
import {
  ArrowLeft, Info, Mic, Volume2, VolumeX,
  MessageSquare, X, Send, Clock, Globe, CheckCircle2, Circle,
  ChevronUp, Lightbulb, Flag,
} from 'lucide-react';

interface CompletionResult {
  passed: boolean;
  compositeScore: number;
  xpGained?: number;
  newStreak?: number;
}

export default function AvatarModePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const {
    session, scenario, character, selectedAvatar, conversations, phase,
    loading, error, isActive, isCompleted, goals, completedGoals,
    domain, situation,
    evaluation, avgPronunciationScore, newWordsCount,
    submitTurnStream, sendGreeting,
    pendingRetry, retryCorrection,
    phaseTransition, dismissPhaseTransition,
    recap, dismissRecap,
    unacknowledgedCompletion, acknowledgeCompletion,
  } = useRoleplaySessionContext();

  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [lastCorrections, setLastCorrections] = useState<any[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [coachOpen, setCoachOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [tipsOpen, setTipsOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'all' | 'key' | 'notes'>('all');
  const [elapsed, setElapsed] = useState('00:00');

  const [celebration, setCelebration] = useState<{ variant: CelebrationVariant; title: string; subtitle?: string } | null>(null);
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);
  const [aiTurnActive, setAiTurnActive] = useState(false);
  const pendingCelebrationRef = useRef<CompletionResult | null>(null);
  const lastAiCompletedRef = useRef<number>(0);
  const emotionSystemRef = useRef<EmotionSystem | null>(null);
  const { status: connectionStatus } = useLatencyMonitor();
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const { caption, playCaption, clear: clearCaption } = useAvatarCaptions();

  useEffect(() => {
    if (lastAiCompletedRef.current === 0) {
      lastAiCompletedRef.current = Date.now();
    }
  }, []);

  // The viewport only mounts once the session request resolves, so the clips
  // would otherwise sit untouched for that whole round trip. They are the same
  // files for every character, so there is nothing to wait on before asking.
  useEffect(() => { preloadAnimationClips(); }, []);

  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const targetLangRef = useRef('ja');
  const nativeLangRef = useRef('en');
  const phaseRef = useRef('');
  const sendingRef = useRef(false);
  const isActiveRef = useRef(false);

  // The avatar the learner picked for this session wins over the scenario's
  // seeded character — scenario rows are shared across sessions, the pick is not.
  const charName = selectedAvatar?.name ?? character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const charRole = (selectedAvatar ? scenario?.aiCharacterRole : character?.role ?? scenario?.aiCharacterRole) ?? undefined;
  const avatarModelUrl = selectedAvatar?.file ?? character?.avatarModelUrl ?? scenario?.avatarModelUrl ?? DEFAULT_AVATAR_MODEL_URL;

  // Anchored on the session's own start time rather than this page's mount:
  // avatar and voice are two views of one session, so switching between them
  // (or reloading) has to carry the clock over instead of restarting at 00:00.
  const sessionStartTime: number | null = session?.startedAt
    ? new Date(session.startedAt).getTime()
    : null;

  // Session timer
  useEffect(() => {
    if (sessionStartTime === null) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000));
      const m = String(Math.floor(diff / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${m}:${s}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  // Auto-scroll chat panel
  useEffect(() => {
    if (!chatOpen) return;
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, chatOpen]);

  const handleReplay = useCallback((turn: TurnData) => {
    if (muted) return;
    unlockAudio();
    const t = turn.messageTarget || turn.messageNative;
    if (!t) return;
    const bcp47 = getBCP47(targetLanguage, 'tts');
    speakMixedText(t, bcp47, targetLanguage === nativeLanguage ? bcp47 : getNativeLangBcp47(nativeLanguage), phase).catch(() => {});
  }, [muted, targetLanguage, nativeLanguage, phase]);

  const primaryGoal = situation?.learningGoals ?? scenario?.learningGoals ?? '';

  const leaveSession = useCallback(async (redirectTo?: string) => {
    stopTts();
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
    router.push(redirectTo || `/sessions/${sessionId}/report`);
  }, [sessionId, router]);

  // Muting has to silence the line already playing, not just the next one —
  // the ref guard alone left the current utterance running to the end.
  useEffect(() => {
    mutedRef.current = muted;
    if (muted) stopTts();
  }, [muted]);
  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { nativeLangRef.current = nativeLanguage; }, [nativeLanguage]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  useEffect(() => {
    if (session?.targetLanguage) setTargetLanguage(session.targetLanguage);
    if (session?.nativeLanguage) setNativeLanguage(session.nativeLanguage);
    setVoiceGender(session?.voiceGender || character?.gender || 'Female');
  }, [session, character]);

  // Microphone acquisition is handled once by the recognizer prewarm in
  // useVoiceInput, which holds the stream open for the whole session.

  useEffect(() => {
    setOnSpeakingChange((speaking) => {
      speakingRef.current = speaking;
      setIsAiSpeaking(speaking);
      if (!speaking) lastAiCompletedRef.current = Date.now();
      if (speaking) {
        emotionSystemRef.current?.startTalking?.();
      } else {
        emotionSystemRef.current?.stopTalking?.();
      }
    });
    return () => { setOnSpeakingChange(null); stopTts(); };
  }, []);

  // Recite the welcome-back recap. It reaches the transcript on its own, so
  // unlike every other AI line it never passes through the streaming callbacks
  // that drive speech and captions — without this it would only ever be
  // readable in chat, and the avatar would stay silent on a resumed session.
  useEffect(() => {
    if (!recap) return;
    const text = cleanDisplay(recap.text);
    if (!text || mutedRef.current) { dismissRecap(); return; }

    const cancel = speakWhenAudioUnlocked(() => {
      // The unlock can be deferred to the learner's first gesture — if that
      // gesture was the mute button, the pre-check above is stale by now.
      if (mutedRef.current) { dismissRecap(); return; }
      playCaption(text, Math.max(3000, text.length * 65)).catch(() => {});
      speakMixedText(
        text,
        getBCP47(targetLangRef.current, 'tts'),
        targetLangRef.current === nativeLangRef.current
          ? getBCP47(targetLangRef.current, 'tts')
          : getNativeLangBcp47(nativeLangRef.current),
        phaseRef.current,
      ).catch(() => {});
      dismissRecap();
    });
    return cancel;
  }, [recap, dismissRecap, playCaption]);

  useEffect(() => {
    if (unacknowledgedCompletion && !completionResult) {
      const source = evaluation ?? session ?? {};
      const compositeScore = computeCompositeScore('completed', {
        vocabularyScore: source.vocabularyScore ?? 0,
        grammarScore: source.grammarScore ?? 0,
        fluencyScore: source.fluencyScore ?? 0,
        culturalScore: source.culturalScore ?? 0,
        taskScore: source.taskScore ?? 0,
        // Weighted at 0.10 by computeCompositeScore. Omitting it here scored
        // the same evaluation lower than the report page does, so a session
        // could celebrate as failed and read as passed.
        expressionAppropriatenessScore: source.expressionAppropriatenessScore ?? 0,
      });
      setCompletionResult({ passed: compositeScore >= 70, compositeScore });
    }
  }, [unacknowledgedCompletion, completionResult, session, evaluation]);

  const handleUserUtterance = useCallback(async (text: string) => {
    // A mic release can land after the last turn ended the session — the button
    // is already disabled by then, but the held recognition still flushes here.
    if (sendingRef.current || !text.trim() || !isActiveRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setAiTurnActive(true);
    // The learner has spoken, so last turn's prompts are spent. Clearing them
    // here keeps the conversation flowing: the coach panel only ever shows
    // suggestions for the turn being corrected right now, and a clean turn
    // leaves no leftover chips to answer.
    setSuggestedReplies([]);
    const responseTimeMs = Date.now() - lastAiCompletedRef.current;
    emotionSystemRef.current?.startThinking();
    stopTts();
    clearCaption();
    // Bridge the gap between the mic release and the first streamed token so
    // the learner sees the reply is coming, not that their voice was dropped.
    playCaption('Thinking…', 4000).catch(() => {});

    let fullText = '';
    const speechDoneRef = { current: false };
    const analysisDoneRef = { current: false };
    const tryShowCelebration = () => {
      if (pendingCelebrationRef.current && speechDoneRef.current && analysisDoneRef.current) {
        setCompletionResult(pendingCelebrationRef.current);
        pendingCelebrationRef.current = null;
      }
    };

    try {
      await submitTurnStream(text.trim(), {
        responseTimeMs,
        onToken: (t) => {
          if (t) fullText = t;
          setStreamingText(t ? cleanDisplay(t) : null);
        },
        // Speak the reply as one complete clip once the model has finished,
        // same as the replay button — synthesizing per-sentence as the model
        // streamed made every sentence boundary pay its own Azure connect
        // round trip, which read as slow/choppy compared to a single clip.
        onTextDone: (t: string) => {
          const cleaned = cleanDisplay(t);
          const estDuration = Math.max(3000, cleaned.length * 65);
          if (cleaned) playCaption(cleaned, estDuration).catch(() => {});
          if (!mutedRef.current && cleaned) {
            speakMixedText(
              cleaned,
              getBCP47(targetLangRef.current, 'tts'),
              getNativeLangBcp47(nativeLangRef.current),
              phaseRef.current,
            ).catch(() => {}).then(() => {
              setAiTurnActive(false);
              speechDoneRef.current = true;
              tryShowCelebration();
            });
          } else {
            setAiTurnActive(false);
            speechDoneRef.current = true;
            tryShowCelebration();
          }
        },
        onRetry: (analysis) => {
          setLastCorrections(analysis.corrections ?? []);
          setSuggestedReplies(analysis.suggestedReplies ?? []);
          setCoachOpen(true);
        },
        onCelebration: (info) => {
          if (info?.variant && info.variant !== 'scenario-mastery' && info.variant !== 'needs-practice') {
            setCelebration({
              variant: (info.variant as CelebrationVariant) || 'goal-complete',
              title: 'Goal Completed!',
              subtitle: info.xpGained ? `+${info.xpGained} XP` : undefined,
            });
          } else {
            pendingCelebrationRef.current = {
              passed: info?.passed ?? true,
              compositeScore: info?.score ?? 0,
              xpGained: info?.xpGained,
              newStreak: info?.newStreak,
            };
            tryShowCelebration();
          }
        },
        onComplete: (analysis) => {
          const emo = emotionSystemRef.current;
          if (emo && analysis) {
            emo.apply({ emotionTone: analysis.emotionTone, gestureHint: analysis.gestureHint });
          }
        },
      });
      setStreamingText(null);
      analysisDoneRef.current = true;
      tryShowCelebration();

      const latestUser = [...conversations].reverse().find(c => c.speaker === 'user');
      if (latestUser?.corrections?.length) {
        setLastCorrections(latestUser.corrections);
        setCoachOpen(true);
      }
    } catch (e: any) {
      console.error(e);
      emotionSystemRef.current?.stopThinking();
      setAiTurnActive(false);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [submitTurnStream, conversations, clearCaption, playCaption]);

  const handleChatSend = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed || sending) return;
    setChatInput('');
    handleUserUtterance(trimmed);
  }, [chatInput, sending, handleUserUtterance]);

  const bcp47 = getBCP47(targetLanguage, 'stt');

  const voice = useVoiceInput({
    lang: bcp47,
    onFinal: handleUserUtterance,
  });

  // Single source of truth for what the avatar is doing. This was previously
  // driven only by TTS speaking state, while the listening clip was played
  // imperatively — so the two fought, and any speaking-state change stomped
  // the listening pose back to idle. The AI talking outranks listening (a mic
  // press stops TTS anyway), and idle is the resting state. Derived rather
  // than stored, so it can never drift out of sync with its two inputs.
  const avatarMode: 'idle' | 'listening' | 'talking' =
    isAiSpeaking ? 'talking' : voice.isListening ? 'listening' : 'idle';

  const handleMicStart = useCallback(async () => {
    if (avatarMode === 'talking') stopTts();
    await voice.start();
  }, [avatarMode, voice]);

  const langLabel = targetLanguage === 'ja' ? 'Japanese' : targetLanguage === 'en' ? 'English' : targetLanguage;
  const skillLevelLabel = situation?.skillLevel
    ? situation.skillLevel.charAt(0).toUpperCase() + situation.skillLevel.slice(1)
    : null;

  const chatTurns = chatTab === 'all'
    ? conversations
    : chatTab === 'key'
      ? conversations.filter(t => t.speaker === 'ai')
      : conversations.filter(t => t.speaker === 'user' && (t.corrections?.length ?? 0) > 0);

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

  const scenarioTitle = situation?.title ?? scenario?.title ?? 'this scenario';
  const sessionMetrics = completionResult
    ? buildSessionMetrics({ evaluation, session, avgPronunciationScore, newWordsCount, completedGoals, goals })
    : null;
  const whatWentWrong = sessionMetrics ? buildWhatWentWrong({ conversations, metrics: sessionMetrics }) : [];

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <EnvironmentBackdrop domainSlug={domain?.slug} />

      {/* ── Top Header Bar ── */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-dojo-border/60 shrink-0 backdrop-blur-md bg-dojo-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => { leaveSession('/home'); }} className="flex items-center gap-2 rounded-lg text-dojo-text-muted hover:text-dojo-text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium hidden sm:inline">End Session</span>
          </button>
          <span className="text-sm font-bold text-dojo-text-primary tracking-tight truncate max-w-40 sm:max-w-xs">{scenario?.title ?? 'Avatar Session'}</span>
          <PhaseIndicator phase={phase} />
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ConnectionLatencyIndicator status={connectionStatus} />
          </div>
          <button
            type="button"
            onClick={() => setChatOpen(v => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
              chatOpen
                ? "bg-dojo-accent/20 border-dojo-accent/30 text-dojo-accent"
                : "bg-dojo-surface-raised/80 border-dojo-border/60 text-dojo-text-primary hover:border-dojo-accent/40"
            )}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{chatOpen ? 'Hide Chat' : 'Show Chat'}</span>
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="tap-target flex h-10 w-10 items-center justify-center rounded-full border border-dojo-border/60 bg-dojo-surface-raised/80 text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
          >
            <Info className="h-4 w-4" />
          </button>
          <SessionModeTabs sessionId={sessionId} active="avatar" />
        </div>
      </div>

      {/* Mobile goal progress strip */}
      <div className="md:hidden relative z-10 flex gap-0.5 px-4 pt-2">
        {(goals ?? []).map((g) => (
          <div
            key={g.id}
            className={`h-1 flex-1 rounded-full transition-colors ${(completedGoals ?? []).includes(g.sequenceOrder) ? 'bg-dojo-accent' : 'bg-dojo-border/60'}`}
          />
        ))}
        {(!goals || goals.length === 0) && <div className="h-1 flex-1 rounded-full bg-dojo-border/60" />}
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex-1 relative z-10 overflow-hidden flex">
        {/* Left: 3D Avatar Viewport Stage */}
        <div className="flex-1 relative flex flex-col">
          <PhaseTransitionCard transition={aiTurnActive ? null : phaseTransition} onDismiss={dismissPhaseTransition} />

          {/* Greeting overlay */}
          {isActive && conversations.length === 0 && (phase === 'orientation' || phase === 'icebreaker') && !greetingSent && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-dojo-canvas/90 backdrop-blur-sm px-6">
              <div className="text-center max-w-xs">
                <div className="h-16 w-16 rounded-full bg-dojo-accent/20 mx-auto mb-4 flex items-center justify-center ring-1 ring-dojo-accent/30">
                  <Volume2 className="h-8 w-8 text-dojo-accent" />
                </div>
                <h2 className="text-lg font-bold leading-none text-dojo-text-primary mb-2">Start conversation with {charName}</h2>
                <p className="text-sm text-dojo-text-muted mb-6 leading-relaxed">
                  You&apos;ll practice {langLabel} through realistic role-play scenarios.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    setGreetingSent(true);
                    sendGreeting({
                      onToken: (t: string) => setStreamingText(t ? cleanDisplay(t) : null),
                      onTextDone: (t: string) => {
                        const cleaned = cleanDisplay(t);
                        if (cleaned) playCaption(cleaned, Math.max(3000, cleaned.length * 65)).catch(() => {});
                        if (mutedRef.current || !cleaned) return;
                        speakMixedText(cleaned, getBCP47(targetLangRef.current, 'tts'), getNativeLangBcp47(nativeLangRef.current), phaseRef.current).catch(() => {});
                      },
                    })
                      .then(() => {
                        setStreamingText(null);
                      })
                      .catch(() => { setStreamingText(null); setGreetingSent(false); });
                  }}
                  className="flex items-center gap-3 rounded-xl bg-dojo-accent px-8 py-4 text-base font-semibold text-white shadow-lg shadow-dojo-accent/25 hover:opacity-90 active:scale-95 transition-all"
                >
                  <Volume2 className="h-5 w-5" />
                  Start conversation
                </button>
              </div>
            </div>
          )}

          {/* Your Role card (top-left) */}
          <div className="absolute top-4 left-4 z-10 hidden md:block">
            <div className="rounded-xl bg-dojo-surface/70 backdrop-blur-md border border-dojo-border/40 px-4 py-3 space-y-2 max-w-48">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dojo-surface-raised border border-dojo-border/40">
                  <span className="text-xs text-dojo-text-muted">👤</span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-dojo-text-muted/60 font-medium">Your Role</p>
                  <p className="text-sm font-bold text-dojo-text-primary leading-none">{scenario?.userCharacterRole ?? 'Learner'}</p>
                </div>
              </div>
              {primaryGoal && (
                <div className="border-t border-dojo-border/30 pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-dojo-text-muted/60 font-medium mb-1">Goal</p>
                  <p className="text-xs text-dojo-text-muted leading-relaxed">{primaryGoal}</p>
                </div>
              )}
            </div>
          </div>

          {/* 3D Avatar Canvas */}
          <div className="flex-1 flex items-center justify-center relative">
            <AvatarViewport3D
              name={charName}
              accentColor={charColor}
              mode={avatarMode}
              modelUrl={avatarModelUrl}
              cameraMode="front"
              onSystemReady={(sys) => {
                emotionSystemRef.current = sys;
                if (speakingRef.current) sys.startTalking?.();
              }}
            />
          </div>

          {/* Live caption — floats just above the mic controls so the viewport
              keeps its full height and the avatar stays visible through it */}
          <AvatarCaptionsOverlay caption={caption} className="bottom-32" />

          {/* Partial transcript */}
          {voice.partialTranscript && (
            <div className="absolute bottom-44 left-0 right-0 flex justify-center z-10 px-4">
              <div className="flex items-start gap-2 rounded-xl bg-dojo-surface/85 backdrop-blur-md border border-dojo-border/70 px-4 py-2.5 max-w-md shadow-lg">
                <Mic className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-1" />
                <p className="text-sm text-dojo-text-primary/90 italic leading-relaxed">{voice.partialTranscript}</p>
              </div>
            </div>
          )}

          {/* Session Progress card (bottom-left) */}
          <div className="absolute bottom-28 left-4 z-10 hidden md:block">
            <div className="rounded-xl bg-dojo-surface/70 backdrop-blur-md border border-dojo-border/40 px-4 py-3 max-w-56">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-dojo-text-primary">Session Progress</p>
                <span className="text-[10px] text-dojo-text-muted font-medium">{completedGoals?.length ?? 0} / {goals?.length ?? 0} Goals</span>
              </div>
              {/* Progress bar */}
              <div className="flex gap-1 mb-3">
                {(goals ?? []).map((goal, i) => {
                  const done = (completedGoals ?? []).includes(goal.sequenceOrder);
                  return (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${done ? 'bg-dojo-accent' : 'bg-dojo-border/50'}`}
                    />
                  );
                })}
                {(!goals || goals.length === 0) && <div className="h-1 flex-1 rounded-full bg-dojo-border/50" />}
              </div>
              {/* Goal checklist */}
              <div className="space-y-2">
                {(goals ?? []).slice(0, 3).map((goal, i) => {
                  const done = (completedGoals ?? []).includes(goal.sequenceOrder);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-dojo-success shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-dojo-text-muted/40 shrink-0" />
                      )}
                      <span className={`text-[11px] leading-tight ${done ? 'text-dojo-text-muted line-through' : 'text-dojo-text-primary'}`}>
                        {goal.goalText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Character info card (bottom-right) */}
          <div className="absolute bottom-28 right-4 z-10 hidden md:block">
            <div className="rounded-xl bg-dojo-surface/70 backdrop-blur-md border border-dojo-border/40 px-4 py-3 max-w-56">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white shadow-md"
                  style={{ backgroundColor: charColor }}
                >
                  {charName[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-dojo-text-primary leading-none">{charName}</p>
                  {charRole && <p className="text-[11px] text-dojo-text-muted mt-1">{charRole}</p>}
                </div>
              </div>
              {character?.personalityTraits && character.personalityTraits.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {character.personalityTraits.slice(0, 3).map((trait: string, i: number) => (
                    <span key={i} className="rounded-full bg-dojo-surface-raised border border-dojo-border/50 px-2 py-1 text-[10px] text-dojo-text-muted font-medium">
                      {trait}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Bottom Controls: Mute / Mic / Chat (Transparent to reveal avatar) ── */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-6 safe-bottom z-10 px-4 pointer-events-none">
            <div className="flex items-center justify-center gap-6 sm:gap-8 rounded-2xl bg-black/10 backdrop-blur-[2px] border border-white/10 px-6 sm:px-8 py-3 pointer-events-auto">
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMuted(v => !v)}
                  className={`tap-target flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200 ${
                    muted
                      ? 'bg-dojo-danger/30 text-dojo-danger border-dojo-danger/50 backdrop-blur-md'
                      : 'bg-black/40 border-white/15 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-md'
                  }`}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <span className="text-[10px] text-white/70 font-medium drop-shadow-sm">Mute</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  {voice.isListening && (
                    <>
                      <span className="absolute inset-0 rounded-full bg-dojo-warning/30 animate-ping" />
                      <span
                        className="absolute rounded-full border-2 border-dojo-warning/40 transition-all duration-150"
                        style={{ inset: `${-(8 + voice.volumeLevel * 18)}px` }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onPointerDown={handleMicStart}
                    onPointerUp={voice.stop}
                    onPointerLeave={voice.stop}
                    onPointerCancel={voice.stop}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleMicStart(); } }}
                    onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') voice.stop(); }}
                    onBlur={voice.stop}
                    disabled={!isActive || sending}
                    aria-label={voice.isListening ? 'Stop recording' : 'Start recording'}
                    aria-pressed={voice.isListening}
                    className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 select-none ${
                      voice.isListening
                        ? 'bg-dojo-warning shadow-[0_0_32px_rgba(242,169,59,0.5)] ring-4 ring-dojo-warning/20'
                        : 'bg-dojo-accent/90 hover:bg-dojo-accent hover:scale-105 shadow-[0_8px_24px_rgba(45,59,197,0.4)] backdrop-blur-sm'
                    } disabled:opacity-40`}
                    style={{ touchAction: 'none', transform: voice.isListening ? `scale(${1 + voice.volumeLevel * 0.06})` : undefined }}
                  >
                    <Mic className="h-7 w-7 text-white" />
                  </button>
                </div>
                <span className={`text-[10px] font-bold tracking-widest uppercase transition-all duration-300 drop-shadow-sm ${
                  voice.isListening ? 'text-dojo-warning animate-pulse' : 'text-white/70'
                }`}>
                  {voice.isListening ? 'Listening...' : 'Hold to Speak'}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="tap-target flex h-12 w-12 items-center justify-center rounded-full bg-black/40 border border-white/15 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-md transition-all duration-200"
                  aria-label="Open chat panel"
                >
                  <MessageSquare className="h-5 w-5" />
                </button>
                <span className="text-[10px] text-white/70 font-medium drop-shadow-sm">Chat</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Slide-out Chat Panel (left side) ── */}
        <div className={`absolute top-0 left-0 bottom-0 z-30 w-80 max-w-full sm:w-96 flex flex-col bg-dojo-surface/95 backdrop-blur-xl border-r border-dojo-border/60 shadow-2xl transition-transform duration-300 ease-in-out ${chatOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-dojo-border/60 shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-dojo-accent" />
              <span className="text-sm font-bold text-dojo-text-primary tracking-tight">Conversation</span>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Close conversation panel"
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-dojo-border/20 text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-dojo-border/30 shrink-0">
            {([
              { key: 'all' as const, label: 'All' },
              { key: 'key' as const, label: 'Key Phrases' },
              { key: 'notes' as const, label: 'Notes' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setChatTab(key)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                  chatTab === key
                    ? 'bg-dojo-accent text-white'
                    : 'text-dojo-text-muted hover:text-dojo-text-primary hover:bg-dojo-border/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4 overscroll-contain">
            {chatTurns.length === 0 && (
              <p className="text-center text-xs text-dojo-text-muted/60 py-8">
                {chatTab === 'notes' ? 'No corrections yet — keep speaking!' : 'No messages yet'}
              </p>
            )}
            {chatTurns.map((turn) => {
              const isAi = turn.speaker === 'ai';
              const ts = turn.receivedAt
                ? new Date(turn.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null;
              return (
                <div key={turn.id} className={`flex items-start gap-3 ${!isAi ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white/10"
                    style={{ backgroundColor: isAi ? charColor : '#6366f1' }}
                  >
                    {isAi ? charName[0] : 'U'}
                  </div>
                  <div className={`flex max-w-[80%] flex-col ${!isAi ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-center gap-2 px-1 mb-1 ${!isAi ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="text-xs font-semibold text-dojo-text-primary">{isAi ? charName : 'You'}</span>
                      {ts && <span className="text-[10px] text-dojo-text-muted/60">{ts}</span>}
                    </div>
                    <div className={`px-4 py-3 shadow-sm ${
                      isAi
                        ? 'rounded-2xl rounded-tl-sm bg-dojo-surface-raised/90 border border-dojo-border/60'
                        : 'rounded-2xl rounded-tr-sm bg-dojo-accent/15 border border-dojo-accent/20'
                    }`}>
                      <p className="text-sm text-dojo-text-primary leading-relaxed">{turn.messageTarget}</p>
                      {turn.messagePhonetic && (
                        <p className="mt-1 text-[11px] text-dojo-text-muted italic">{turn.messagePhonetic}</p>
                      )}
                      {!isAi && turn.corrections && turn.corrections.length > 0 && (
                        <div className="mt-2 border-t border-dojo-border/30 pt-2 space-y-1">
                          {turn.corrections.map((c, i) => (
                            <p key={i} className="text-[11px] text-dojo-text-muted leading-relaxed">
                              <span className="line-through">{c.originalText}</span>
                              {' → '}
                              <span className="font-medium text-dojo-text-primary">{c.correctedText}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    {isAi && (
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <button onClick={() => handleReplay(turn)} aria-label="Replay audio message" className="flex h-6 w-6 items-center justify-center rounded-full text-dojo-text-muted/60 hover:text-dojo-accent hover:bg-dojo-accent/10 transition-colors">
                          <Volume2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {!isAi && (
                      <div className="flex items-center gap-1 mt-1 px-1">
                        <span className="text-[10px] text-dojo-accent">✓ Delivered</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {streamingText && chatTab !== 'notes' && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white/10" style={{ backgroundColor: charColor }}>
                  {charName[0]}
                </div>
                <div className="flex max-w-[80%] flex-col items-start">
                  <div className="flex items-center gap-2 px-1 mb-1">
                    <span className="text-xs font-semibold text-dojo-text-primary">{charName}</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-dojo-surface-raised/90 border border-dojo-border/60 px-4 py-3 shadow-sm">
                    <p className="text-sm text-dojo-text-primary leading-relaxed">
                      {streamingText}
                      <span className="inline-block w-0.5 h-4 bg-dojo-accent ml-0.5 animate-pulse align-middle" />
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat input */}
          <div className="shrink-0 border-t border-dojo-border/60 px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl bg-dojo-surface-raised/80 border border-dojo-border/60 px-4 py-2 focus-within:border-dojo-accent/40 transition-colors">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                placeholder="Type a message..."
                disabled={!isActive || sending}
                className="flex-1 bg-transparent border-none px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted/50 outline-none"
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || !isActive || sending}
                aria-label="Send text message"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-dojo-accent text-white disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {suggestedReplies.length > 0 && chatTab !== 'notes' && (
              <div className="mt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-dojo-text-muted mb-2">You could say</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedReplies.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={!isActive || sending}
                      onClick={() => handleUserUtterance(r)}
                      className="rounded-full border border-dojo-accent/30 bg-dojo-accent/10 px-3 py-2 text-[11px] font-medium text-dojo-text-primary hover:border-dojo-accent hover:bg-dojo-accent/20 active:scale-95 disabled:opacity-40 transition-all duration-200"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desktop coach panel (hidden when chat is open) */}
        {!chatOpen && (
          <aside className="hidden lg:flex w-80 shrink-0 flex-col gap-4 border-l border-dojo-border/60 bg-dojo-surface/70 backdrop-blur-md p-4 overflow-y-auto no-scrollbar">
            <VoiceCoachPanel
              corrections={coachOpen ? lastCorrections : []}
              suggestedReplies={coachOpen ? suggestedReplies : []}
              retryTarget={pendingRetry}
              disabled={!isActive || sending}
              onRetry={() => { setCoachOpen(false); retryCorrection(); }}
              onDismiss={() => setCoachOpen(false)}
              onPickSuggestion={(text) => { setCoachOpen(false); handleUserUtterance(text); }}
            />
          </aside>
        )}
      </div>

      {/* ── Bottom Status Bar ── */}
      <div className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-2 border-t border-dojo-border/40 bg-dojo-surface/60 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-dojo-text-muted/60" />
            <span className="text-xs text-dojo-text-primary font-medium">{elapsed}</span>
            <span className="text-[10px] text-dojo-text-muted/60">Session Time</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-xs text-dojo-text-primary font-medium">{skillLevelLabel ?? '—'}</span>
            <span className="text-[10px] text-dojo-text-muted/60">Your Level</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-dojo-text-muted/60" />
            <span className="text-xs text-dojo-text-primary font-medium">{langLabel}</span>
            <span className="text-[10px] text-dojo-text-muted/60">Target Language</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTipsOpen(v => !v)}
          className="flex items-center gap-2 rounded-full bg-dojo-accent/10 border border-dojo-accent/20 px-3 py-1.5 text-xs font-semibold text-dojo-accent hover:bg-dojo-accent/20 transition-colors"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          Session Tips
          <ChevronUp className={`h-3 w-3 transition-transform ${tipsOpen ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Tips panel */}
      {tipsOpen && (
        <div className="relative z-20 border-t border-dojo-border/30 bg-dojo-surface/80 backdrop-blur-md px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-start gap-2 max-w-2xl">
            <Lightbulb className="h-4 w-4 text-dojo-warning shrink-0 mt-0.5" />
            <p className="text-xs text-dojo-text-muted leading-relaxed">
              {primaryGoal || 'Try using polite expressions and formal language patterns in your responses.'}
            </p>
          </div>
        </div>
      )}

      <SessionInfoDrawer
        open={infoOpen} onClose={() => setInfoOpen(false)}
        domain={domain} situation={situation} scenario={scenario}
        session={session} character={character}
        charName={charName} charColor={charColor}
        goals={goals} completedGoals={completedGoals}
        isActive={isActive} isCompleted={isCompleted}
        targetLanguage={targetLanguage} nativeLanguage={nativeLanguage}
        correctionCount={conversations.reduce((s, c) => s + (c.corrections?.length ?? 0), 0)}
        onEnd={leaveSession}
        onViewReport={() => { stopTts(); router.push(`/sessions/${sessionId}/report`); }}
      />

      {celebration && (
        <CelebrationOverlay
          {...celebration}
          onDismiss={() => {
            setCelebration(null);
            acknowledgeCompletion();
          }}
          onRepeat={() => {
            setCelebration(null);
            acknowledgeCompletion();
            router.push(`/session/${sessionId}`);
          }}
        />
      )}

      {completionResult && sessionMetrics && (
        completionResult.passed ? (
          <LessonCompleteScreen
            scenarioTitle={scenarioTitle}
            metrics={sessionMetrics}
            xpGained={completionResult.xpGained}
            newStreak={completionResult.newStreak}
            onContinue={() => { setCompletionResult(null); acknowledgeCompletion(); router.push('/home'); }}
            onRepeat={() => { setCompletionResult(null); acknowledgeCompletion(); router.push(`/session/${sessionId}`); }}
          />
        ) : (
          <LessonIncompleteScreen
            scenarioTitle={scenarioTitle}
            compositeScore={completionResult.compositeScore}
            metrics={sessionMetrics}
            whatWentWrong={whatWentWrong}
            onRepeat={() => { setCompletionResult(null); acknowledgeCompletion(); router.push(`/session/${sessionId}`); }}
            onNext={() => { setCompletionResult(null); acknowledgeCompletion(); router.push('/home'); }}
            onLeave={() => { setCompletionResult(null); acknowledgeCompletion(); leaveSession(); }}
          />
        )
      )}
    </div>
  );
}
