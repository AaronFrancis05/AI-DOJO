'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { VoiceOnlyStage } from '@/components/roleplay/VoiceOnlyStage';
import { PhaseIndicator } from '@/components/roleplay/PhaseIndicator';
import { SessionModeTabs } from '@/components/roleplay/SessionModeTabs';
import { SessionInfoDrawer } from '@/components/roleplay/SessionInfoDrawer';
import { VoiceCoachPanel } from '@/components/roleplay/VoiceCoachPanel';
import { ConversationBubble } from '@/components/roleplay/ConversationBubble';
import { ConnectionLatencyIndicator, useLatencyMonitor } from '@/components/roleplay/ConnectionLatencyIndicator';
import { useVoiceInput } from '@/lib/hooks/useVoiceInput';
import { useRoleplaySessionContext } from '@/lib/hooks/RoleplaySessionContext';
import { speakMixedText, stop as stopTts, resetStreamingTts, setOnSpeakingChange, unlockAudio } from '@/lib/roleplay/tts';
import { CelebrationOverlay } from '@/components/roleplay/CelebrationOverlay';
import type { CelebrationVariant } from '@/components/roleplay/CelebrationOverlay';
import { getBCP47, getNativeLangBcp47 } from '@/lib/language';
import { ArrowLeft, Flag, Info, Volume2, VolumeX } from 'lucide-react';

export default function VoiceOnlyPage() {
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

  const [celebration, setCelebration] = useState<{ variant: CelebrationVariant; title: string; subtitle?: string } | null>(null);
  const lastAiCompletedRef = useRef<number>(Date.now());
  const { status: connectionStatus } = useLatencyMonitor();

  const sendingRef = useRef(false);
  const mutedRef = useRef(false);
  const targetLangRef = useRef('ja');
  const nativeLangRef = useRef('en');
  const phaseRef = useRef('');

  const charName = character?.name ?? scenario?.aiCharacterName ?? 'Assistant';
  const charColor = character?.avatarColor ?? '#2D3BC5';
  const latestAi = [...conversations].reverse().find(c => c.speaker === 'ai') ?? null;

  const handleReplay = useCallback((turn: NonNullable<typeof latestAi>) => {
    if (muted) return;
    unlockAudio();
    const t = turn.messageTarget || turn.messageNative;
    if (!t) return;
    const bcp47 = getBCP47(targetLanguage, 'tts');
    speakMixedText(t, bcp47, targetLanguage === nativeLanguage ? bcp47 : getNativeLangBcp47(nativeLanguage), phase).catch(() => {});
  }, [muted, targetLanguage, nativeLanguage, phase]);

  const primaryGoal = situation?.learningGoals ?? scenario?.learningGoals ?? '';

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
      setAvatarMode(speaking ? 'talking' : 'idle');
      if (!speaking) lastAiCompletedRef.current = Date.now();
    });
    return () => setOnSpeakingChange(null);
  }, []);

  function cleanDisplay(text: string): string {
    return text.replace(/【[^】]*】/g, '').trim();
  }

  const handleUserUtterance = useCallback(async (text: string) => {
    if (sendingRef.current || !text.trim()) return;
    sendingRef.current = true;
    setSending(true);
    const responseTimeMs = Date.now() - lastAiCompletedRef.current;
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
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [submitTurnStream, conversations]);

  const bcp47 = getBCP47(targetLanguage, 'stt');

  const voice = useVoiceInput({
    lang: bcp47,
    onFinal: handleUserUtterance,
  });

  const handleMicStart = useCallback(async () => {
    if (avatarMode === 'talking') stopTts();
    await voice.start();
  }, [avatarMode, voice]);

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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dojo-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/home')} className="text-dojo-text-muted hover:text-dojo-text-primary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-dojo-text-primary">{scenario?.title ?? 'Voice'}</span>
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
          <SessionModeTabs sessionId={sessionId} active="voice" />
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-stretch">
        <div className="flex-1 relative">
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

          <VoiceOnlyStage name={charName} accentColor={charColor} mode={avatarMode} />

          {voice.partialTranscript && (
            <div className="absolute bottom-32 left-0 right-0 flex justify-center">
              <div className="px-4 py-2 rounded-xl bg-dojo-surface/80 backdrop-blur-md border border-dojo-border border-dashed max-w-md">
                <p className="text-sm text-dojo-text-primary/70 italic">{voice.partialTranscript}</p>
              </div>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-8 safe-bottom">
            <div className="relative">
              {voice.isListening && (
                <>
                  <span className="absolute inset-0 rounded-full bg-dojo-warning/30 animate-ping" />
                  <span className="absolute inset-0 rounded-full bg-dojo-warning/20 animate-pulse" />
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
                    ? 'bg-dojo-warning scale-110 shadow-[0_0_30px_rgba(242,169,59,0.6)] ring-4 ring-dojo-warning/20'
                    : 'bg-dojo-accent hover:scale-105 shadow-[0_10px_25px_rgba(45,59,197,0.5)]'
                } disabled:opacity-40`}
                style={{ touchAction: 'none' }}
              >
                <Volume2 className="h-7 w-7 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop side panel */}
        <aside className="hidden md:flex w-80 shrink-0 flex-col gap-3 border-l border-dojo-border/60 bg-dojo-surface/70 backdrop-blur-md p-4 overflow-y-auto no-scrollbar">
          {latestAi && (
            <div className="space-y-2">
              <ConversationBubble
                speaker="ai" name={charName} accentColor={charColor}
                messageJp={streamingText ?? latestAi.messageTarget ?? latestAi.messageNative ?? ''}
                messageRomaji={latestAi.messageRomaji ?? undefined}
                messageEn={latestAi.messageNative ?? undefined}
              />
              <div className="flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() => handleReplay(latestAi)}
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
            onPickSuggestion={(text) => { setCoachOpen(false); handleUserUtterance(text); }}
          />
        </aside>
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
