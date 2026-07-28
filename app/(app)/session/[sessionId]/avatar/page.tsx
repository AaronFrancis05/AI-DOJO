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
import { speakMixedText, stop as stopTts, resetStreamingTts, setOnSpeakingChange, unlockAudio } from '@/lib/roleplay/tts';
import { CelebrationOverlay } from '@/components/roleplay/CelebrationOverlay';
import type { CelebrationVariant } from '@/components/roleplay/CelebrationOverlay';
import { getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { ArrowLeft, Flag, Info, MessageSquare, Volume2, VolumeX } from 'lucide-react';

export default function AvatarModePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.sessionId);

  const {
    session, scenario, character, conversations, phase,
    loading, error, isActive, isCompleted, goals, completedGoals,
    domain, situation,
    submitTurnStream, sendGreeting,
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
  }, [session]);

  useEffect(() => {
    if ('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {});
    }
  }, []);

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

  function cleanDisplay(text: string): string {
    return text.replace(/【[^】]*】/g, '').trim();
  }

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
        onCelebration: () => setCelebration({
          variant: 'scenario-mastery',
          title: 'Scenario Mastered!',
          subtitle: `You've completed every goal in "${situation?.title ?? scenario?.title ?? 'this scenario'}".`,
        }),
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

  // Auto-show mobile message sheet on new AI turns
  useEffect(() => {
    if (latestConvo?.speaker === 'ai') setMobileMsgOpen(true);
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

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#0a0a1a] via-[#0d0d24] to-[#111128]">
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

      <div className="flex-1 relative overflow-hidden flex items-stretch">
        {conversations.length === 0 && phase === 'icebreaker' && !greetingSent && (
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
                messageRomaji={latestAiConvo.messageRomaji ?? undefined}
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
            onDismiss={() => setCoachOpen(false)}
            onPickSuggestion={(text) => { setCoachOpen(false); handleFinalTranscript(text); }}
          />
        </aside>
      </div>

      {/* Mobile bottom sheet for messages */}
      {mobileMsgOpen && latestAiConvo && (
        <div className="md:hidden absolute bottom-24 left-4 right-4 z-30 animate-in slide-in-from-bottom-2 duration-200">
          <div className="rounded-xl border border-dojo-border bg-dojo-surface/95 backdrop-blur-md p-3 shadow-2xl">
            <ConversationBubble
              speaker="ai" name={charName} accentColor={charColor}
              messageJp={streamingText ?? latestAiConvo.messageTarget ?? latestAiConvo.messageNative ?? ''}
              messageRomaji={latestAiConvo.messageRomaji ?? undefined}
              messageEn={latestAiConvo.messageNative ?? undefined}
            />
            <div className="flex items-center gap-2 px-1 mt-1">
              <button
                type="button"
                onClick={() => handleReplay(latestAiConvo)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-dojo-surface/50 text-dojo-text-muted hover:text-dojo-accent hover:bg-dojo-accent/10 transition-colors"
                aria-label="Replay"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>
            </div>
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
        onEnd={async () => { await fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) }).catch(() => {}); router.push(`/sessions/${sessionId}/report`); }}
        onViewReport={() => router.push(`/sessions/${sessionId}/report`)}
      />

      {celebration && (
        <CelebrationOverlay
          {...celebration}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
