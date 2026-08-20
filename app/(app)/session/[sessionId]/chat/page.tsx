'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChatPanel } from '@/components/roleplay/ChatPanel';
import { RoleplayInputBar } from '@/components/roleplay/RoleplayInputBar';
import { CorrectionRetryBar } from '@/components/roleplay/CorrectionRetryBar';
import { PhaseIndicator } from '@/components/roleplay/PhaseIndicator';
import { SessionModeTabs } from '@/components/roleplay/SessionModeTabs';
import { SessionInfoDrawer } from '@/components/roleplay/SessionInfoDrawer';
import { ConnectionLatencyIndicator, useLatencyMonitor } from '@/components/roleplay/ConnectionLatencyIndicator';
import { useRoleplaySessionContext } from '@/lib/hooks/RoleplaySessionContext';
import { getTargetLangConfig, getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { speakMixedText, stop as stopTts, resetStreamingTts, setOnSpeakingChange, unlockAudio, setVoiceGender } from '@/lib/roleplay/tts';
import { CelebrationOverlay } from '@/components/roleplay/CelebrationOverlay';
import type { CelebrationVariant } from '@/components/roleplay/CelebrationOverlay';
import { PhaseTransitionCard } from '@/components/roleplay/PhaseTransitionCard';
import { LessonCompleteScreen } from '@/components/roleplay/LessonCompleteScreen';
import { LessonIncompleteScreen } from '@/components/roleplay/LessonIncompleteScreen';
import { buildSessionMetrics, buildWhatWentWrong } from '@/lib/roleplay/session-metrics';
import { computeCompositeScore } from '@/lib/roleplay/phase-engine';
import { ArrowLeft, Info, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface CompletionResult {
  passed: boolean;
  compositeScore: number;
  xpGained?: number;
  newStreak?: number;
}

export default function ChatOnlyPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const {
    session, scenario, character, conversations, phase,
    loading, error, isActive, isCompleted, goals, completedGoals,
    domain, situation,
    evaluation, avgPronunciationScore, newWordsCount,
    submitTurnStream, sendGreeting,
    pendingRetry, retryCorrection, dismissRetry,
    phaseTransition, dismissPhaseTransition,
    unacknowledgedCompletion, acknowledgeCompletion,
  } = useRoleplaySessionContext();

  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');
  const [muted, setMuted] = useState(false);
  const [textMode, setTextMode] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [celebration, setCelebration] = useState<{ variant: CelebrationVariant; title: string; subtitle?: string } | null>(null);
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);
  const lastAiCompletedRef = useRef<number>(Date.now());
  const { status: connectionStatus } = useLatencyMonitor();

  useEffect(() => {
    if (session?.targetLanguage) setTargetLanguage(session.targetLanguage);
    if (session?.nativeLanguage) setNativeLanguage(session.nativeLanguage);
    setVoiceGender(session?.voiceGender || character?.gender || 'Female');
  }, [session, character]);

  useEffect(() => {
    setOnSpeakingChange((speaking) => {
      if (!speaking) lastAiCompletedRef.current = Date.now();
    });
    return () => setOnSpeakingChange(null);
  }, []);

  useEffect(() => {
    if ((phase === 'orientation' || phase === 'icebreaker') && !greetingSent && !loading && !sending && conversations.length === 0) {
      setGreetingSent(true);
      sendGreeting().catch(() => {});
    }
  }, [phase, greetingSent, loading, sending, conversations.length, sendGreeting]);

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

  const handleSend = useCallback(async (text: string) => {
    if (sending || !text.trim()) return;
    unlockAudio();
    setSending(true);
    setStreamingText('');
    setSuggestedReplies([]);
    stopTts();
    resetStreamingTts();

    const responseTimeMs = text !== '__session_start__' ? Date.now() - lastAiCompletedRef.current : 0;

    try {
      await submitTurnStream(text, {
        responseTimeMs,
        onToken: (t) => setStreamingText(t ? t.replace(/【VOCAB\s+\d+】/g, '').trim() : null),
        onRetry: (analysis) => {
          setSuggestedReplies(analysis.suggestedReplies ?? []);
        },
        onPhaseChange: () => {},
        onCelebration: (info) => {
          setCompletionResult({
            passed: info?.passed ?? true,
            compositeScore: info?.score ?? 0,
            xpGained: info?.xpGained,
            newStreak: info?.newStreak,
          });
        },
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
    unlockAudio();
    const t = turn.messageTarget || turn.messageNative;
    if (!t) return;
    const bcp47 = getBCP47(targetLanguage, 'tts');
    speakMixedText(t, bcp47, targetLanguage === nativeLanguage ? bcp47 : getNativeLangBcp47(nativeLanguage), phase).catch(() => {});
  }, [muted, targetLanguage, nativeLanguage, phase]);

  const leaveSession = useCallback(async () => {
    await fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) }).catch(() => {});
    router.push(`/sessions/${sessionId}/report`);
  }, [sessionId, router]);

  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const targetName = getTargetLangConfig(targetLanguage).name;

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

  const panelProps = {
    conversations,
    charName,
    charColor,
    avatarMode: streamingText ? ('talking' as const) : ('idle' as const),
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-dojo-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/home')} className="text-dojo-text-muted hover:text-dojo-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-dojo-text-primary">{scenario?.title ?? 'Chat'}</span>
          <PhaseIndicator phase={phase} />
          <ConnectionLatencyIndicator status={connectionStatus} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="tap-target flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-dojo-text-muted hover:text-dojo-text-primary"
          >
            <Info className="h-4 w-4" />
          </button>
          <SessionModeTabs sessionId={sessionId} active="chat" />
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <ChatPanel {...panelProps} />
        <PhaseTransitionCard transition={phaseTransition} onDismiss={dismissPhaseTransition} />
      </div>

      {pendingRetry && (
        <div className="shrink-0">
          <CorrectionRetryBar
            retry={pendingRetry}
            onRetry={retryCorrection}
            onDismiss={dismissRetry}
            disabled={sending}
          />
        </div>
      )}

      <div className="shrink-0 px-4 py-3 border-t border-dojo-border safe-bottom">
        <RoleplayInputBar
          onSend={handleSend}
          onPause={() => {
            fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) }).catch(() => {});
          }}
          disabled={!isActive || sending}
          showTextInput={textMode}
          onToggleTextInput={() => setTextMode(v => !v)}
        />
      </div>

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
