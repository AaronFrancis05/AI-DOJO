'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AvatarMicOverlay } from '@/components/roleplay/AvatarMicOverlay';
import { ConversationBubble } from '@/components/roleplay/ConversationBubble';
import { AvatarViewport3D } from '@/components/roleplay/AvatarViewport3D';
import { EmotionSystem } from '@/components/roleplay/three/EmotionSystem';
import { PhaseIndicator } from '@/components/roleplay/PhaseIndicator';
import { SessionModeTabs } from '@/components/roleplay/SessionModeTabs';
import { SessionInfoDrawer } from '@/components/roleplay/SessionInfoDrawer';
import { VoiceCoachPanel } from '@/components/roleplay/VoiceCoachPanel';
import { ConnectionLatencyIndicator, useLatencyMonitor } from '@/components/roleplay/ConnectionLatencyIndicator';
import { useRoleplaySessionContext } from '@/lib/hooks/RoleplaySessionContext';
import { speakMixedText, stop as stopTts, resetStreamingTts, setOnSpeakingChange, unlockAudio, setVoiceGender } from '@/lib/roleplay/tts';
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
import { ArrowLeft, Flag, Info, MessageSquare, Volume2, VolumeX, X } from 'lucide-react';

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
    session, scenario, character, conversations, phase,
    loading, error, isActive, isCompleted, goals, completedGoals,
    domain, situation,
    evaluation, avgPronunciationScore, newWordsCount,
    submitTurnStream, sendGreeting,
    pendingRetry, retryCorrection,
    phaseTransition, dismissPhaseTransition,
    unacknowledgedCompletion, acknowledgeCompletion,
  } = useRoleplaySessionContext();

  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [avatarMode, setAvatarMode] = useState<'idle' | 'listening' | 'talking'>('idle');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [lastCorrections, setLastCorrections] = useState<any[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [coachOpen, setCoachOpen] = useState(false);
  const [mobileMsgOpen, setMobileMsgOpen] = useState(false);
  const [celebration, setCelebration] = useState<{ variant: CelebrationVariant; title: string; subtitle?: string } | null>(null);
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);
  const lastAiCompletedRef = useRef<number>(Date.now());
  const emotionSystemRef = useRef<EmotionSystem | null>(null);
  const { status: connectionStatus } = useLatencyMonitor();

  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const targetLangRef = useRef('ja');
  const nativeLangRef = useRef('en');
  const phaseRef = useRef('');
  const sendingRef = useRef(false);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { targetLangRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { nativeLangRef.current = nativeLanguage; }, [nativeLanguage]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (session?.targetLanguage) setTargetLanguage(session.targetLanguage);
    if (session?.nativeLanguage) setNativeLanguage(session.nativeLanguage);
    setVoiceGender(session?.voiceGender || character?.gender || 'Female');
  }, [session, character]);

  useEffect(() => {
    if ('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (unacknowledgedCompletion && !completionResult) {
      const source = evaluation ?? session ?? {};
      const compositeScore = computeCompositeScore('completed', {
        vocabularyScore: source.vocabularyScore ?? 0,
        grammarScore: source.grammarScore ?? 0,
        fluencyScore: source.fluencyScore ?? 0,
        culturalScore: source.culturalScore ?? 0,
        taskScore: source.taskScore ?? 0,
      });
      setCompletionResult({ passed: compositeScore >= 70, compositeScore });
    }
  }, [unacknowledgedCompletion, completionResult, session, evaluation]);

  useEffect(() => {
    setOnSpeakingChange((speaking) => {
      speakingRef.current = speaking;
      setAvatarMode(speaking ? 'talking' : 'idle');
      if (!speaking) lastAiCompletedRef.current = Date.now();
      if (speaking) {
        emotionSystemRef.current?.startTalking?.();
      } else {
        emotionSystemRef.current?.stopTalking?.();
      }
    });
    return () => setOnSpeakingChange(null);
  }, []);

  const handleFinalTranscript = useCallback(async (text: string) => {
    if (sendingRef.current || !text.trim()) return;
    sendingRef.current = true;
    setSending(true);
    const responseTimeMs = Date.now() - lastAiCompletedRef.current;
    emotionSystemRef.current?.startThinking();
    stopTts();
    resetStreamingTts();

    let fullText = '';

    try {
      await submitTurnStream(text.trim(), {
        responseTimeMs,
        onToken: (t) => {
          if (t) fullText = t;
          setStreamingText(t ? cleanDisplay(t) : null);
        },
        onRetry: (analysis) => {
          setLastCorrections(analysis.corrections ?? []);
          setSuggestedReplies(analysis.suggestedReplies ?? []);
          setCoachOpen(true);
        },
        onCelebration: (info) => {
          setCompletionResult({
            passed: info?.passed ?? true,
            compositeScore: info?.score ?? 0,
            xpGained: info?.xpGained,
            newStreak: info?.newStreak,
          });
        },
        onComplete: (analysis) => {
          const emo = emotionSystemRef.current;
          if (emo && analysis) {
            emo.apply({ emotionTone: analysis.emotionTone, gestureHint: analysis.gestureHint });
          }
        },
      });
      setStreamingText(null);

      const cleaned = cleanDisplay(fullText);
      if (!mutedRef.current && cleaned) {
        speakMixedText(
          cleaned,
          getBCP47(targetLangRef.current, 'tts'),
          getNativeLangBcp47(nativeLangRef.current),
          phaseRef.current,
        ).catch(() => {});
      }

      const latestUser = [...conversations].reverse().find(c => c.speaker === 'user');
      if (latestUser?.corrections?.length) {
        setLastCorrections(latestUser.corrections);
        setCoachOpen(true);
      }
    } catch (e: any) {
      console.error(e);
      emotionSystemRef.current?.stopThinking();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [submitTurnStream, conversations]);

  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const avatarModelUrl = character?.avatarModelUrl ?? scenario?.avatarModelUrl;

  const latestConvo = conversations.length > 0 ? conversations[conversations.length - 1] : null;
  const latestAiConvo = [...conversations].reverse().find(c => c.speaker === 'ai') ?? null;

  // Auto-show mobile message sheet on new AI turns; auto-dismiss after 6s
  useEffect(() => {
    if (latestConvo?.speaker === 'ai') {
      setMobileMsgOpen(true);
      const timer = setTimeout(() => setMobileMsgOpen(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [latestConvo?.id]);

  const handleReplay = useCallback((turn: NonNullable<typeof latestAiConvo>) => {
    if (muted) return;
    unlockAudio();
    const t = turn.messageTarget || turn.messageNative;
    if (!t) return;
    const bcp47 = getBCP47(targetLanguage, 'tts');
    speakMixedText(t, bcp47, targetLanguage === nativeLanguage ? bcp47 : getNativeLangBcp47(nativeLanguage), phase).catch(() => {});
  }, [muted, targetLanguage, nativeLanguage, phase]);

  const primaryGoal = situation?.learningGoals ?? scenario?.learningGoals ?? '';

  const leaveSession = useCallback(async () => {
    await fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) }).catch(() => {});
    router.push(`/sessions/${sessionId}/report`);
  }, [sessionId, router]);

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
    <div className="relative flex h-full flex-col bg-gradient-to-b from-[#0a0a1a] via-[#0d0d24] to-[#111128]">
      <EnvironmentBackdrop domainSlug={domain?.slug} />
      <div className="relative z-20 flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/home')} className="text-dojo-text-muted hover:text-dojo-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-dojo-text-primary">{scenario?.title ?? 'Avatar'}</span>
          <PhaseIndicator phase={phase} />
          <ConnectionLatencyIndicator status={connectionStatus} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(v => !v)}
            className={`tap-target flex h-10 w-10 items-center justify-center rounded-full border ${muted ? 'border-dojo-danger text-dojo-danger' : 'border-white/10 text-dojo-text-muted'}`}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="tap-target flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-dojo-text-muted hover:text-dojo-text-primary"
          >
            <Info className="h-4 w-4" />
          </button>
          <SessionModeTabs sessionId={sessionId} active="avatar" />
        </div>
      </div>

      <div className="flex-1 relative z-10 overflow-hidden flex items-stretch">
        <PhaseTransitionCard transition={phaseTransition} onDismiss={dismissPhaseTransition} />
        {conversations.length === 0 && (phase === 'orientation' || phase === 'icebreaker') && !greetingSent && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#050B14]/90 backdrop-blur-sm px-6">
            <div className="text-center max-w-xs">
              <div className="h-16 w-16 rounded-full bg-dojo-accent/20 mx-auto mb-4 flex items-center justify-center">
                <Volume2 className="h-8 w-8 text-dojo-accent" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Start conversation with {charName}</h2>
              <p className="text-sm text-dojo-text-muted mb-6">
                You&apos;ll practice {targetLanguage === 'ja' ? 'Japanese' : targetLanguage} through realistic role-play scenarios.
              </p>
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  setGreetingSent(true);
                  sendGreeting({ onToken: (t) => setStreamingText(t ? cleanDisplay(t) : null) })
                    .then((fullText) => {
                      setStreamingText(null);
                      const cleaned = cleanDisplay(fullText);
                      if (!mutedRef.current && cleaned) {
                        speakMixedText(
                          cleaned,
                          getBCP47(targetLangRef.current, 'tts'),
                          getNativeLangBcp47(nativeLangRef.current),
                          phaseRef.current,
                        ).catch(() => {});
                      }
                    })
                    .catch(() => { setStreamingText(null); setGreetingSent(false); });
                }}
                className="flex items-center gap-3 rounded-xl bg-dojo-accent px-8 py-4 text-base font-semibold text-white shadow-lg shadow-dojo-accent/25 hover:opacity-90 transition-all active:scale-95"
              >
                <Volume2 className="h-5 w-5" />
                Start conversation
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center relative">
          <AvatarViewport3D name={charName} accentColor={charColor} mode={avatarMode} modelUrl={avatarModelUrl} cameraMode="front" onSystemReady={(sys) => { emotionSystemRef.current = sys; if (speakingRef.current) sys.startTalking?.(); }} />
        </div>

        {/* Desktop side panel */}
        <aside className="hidden md:flex w-80 shrink-0 flex-col gap-3 border-l border-dojo-border/60 bg-dojo-surface/70 backdrop-blur-md p-4 overflow-y-auto no-scrollbar">
          {latestAiConvo && (
            <div className="space-y-2">
              <ConversationBubble
                speaker="ai" name={charName} accentColor={charColor}
                messageJp={streamingText ?? latestAiConvo.messageTarget ?? latestAiConvo.messageNative ?? ''}
                messagePhonetic={latestAiConvo.messagePhonetic ?? undefined}
                messageEn={latestAiConvo.messageNative ?? undefined}
              />
              <div className="flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() => handleReplay(latestAiConvo)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-dojo-surface/50 text-dojo-text-muted hover:text-dojo-accent hover:bg-dojo-accent/10 transition-colors"
                  aria-label="Replay"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {primaryGoal && (
                <div className="flex items-start gap-2 px-1 pt-2 border-t border-dojo-border/40">
                  <Flag className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-0.5" />
                  <p className="text-[11px] text-dojo-text-muted leading-relaxed">{primaryGoal}</p>
                </div>
              )}
            </div>
          )}
          <VoiceCoachPanel
            corrections={coachOpen ? lastCorrections : []}
            suggestedReplies={coachOpen ? suggestedReplies : []}
            retryTarget={pendingRetry}
            onRetry={() => { setCoachOpen(false); retryCorrection(); }}
            onDismiss={() => setCoachOpen(false)}
            onPickSuggestion={(text) => { setCoachOpen(false); handleFinalTranscript(text); }}
          />
        </aside>
      </div>

      {/* Mobile message banner — compact, dismissible, semi-transparent */}
      {mobileMsgOpen && latestAiConvo && (
        <div className="md:hidden absolute bottom-20 left-3 right-3 z-30">
          <div className="rounded-xl border border-dojo-border/60 bg-dojo-surface/70 backdrop-blur-xl p-3 shadow-2xl flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug text-dojo-text-primary line-clamp-2">
                {streamingText ?? latestAiConvo.messageTarget ?? latestAiConvo.messageNative ?? ''}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => handleReplay(latestAiConvo)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-dojo-surface/50 text-dojo-text-muted hover:text-dojo-accent transition-colors"
                  aria-label="Replay"
                >
                  <Volume2 className="h-3 w-3" />
                </button>
                <span className="text-[10px] text-dojo-text-muted/60">{charName}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMsgOpen(false)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-dojo-text-muted/60 hover:text-dojo-text-primary hover:bg-dojo-surface/50 transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <AvatarMicOverlay
        targetLanguage={targetLanguage}
        onFinalTranscript={handleFinalTranscript}
        isAiResponding={avatarMode === 'talking'}
        muted={muted}
        onMuteToggle={() => setMuted(v => !v)}
      />

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
        onViewReport={() => router.push(`/sessions/${sessionId}/report`)}
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
