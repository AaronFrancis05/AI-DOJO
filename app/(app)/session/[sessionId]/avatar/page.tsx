"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AvatarComponents from "@/components/avatar/AvatarComponents";
import { PhaseIndicator } from "@/components/roleplay/PhaseIndicator";
import { SessionModeTabs } from "@/components/roleplay/SessionModeTabs";
import { SessionInfoDrawer } from "@/components/roleplay/SessionInfoDrawer";
import {
  ConnectionLatencyIndicator,
  useLatencyMonitor,
} from "@/components/roleplay/ConnectionLatencyIndicator";
import { useRoleplaySessionContext } from "@/lib/hooks/RoleplaySessionContext";
import {
  stop as stopTts,
  resetStreamingTts,
  setOnSpeakingChange,
  unlockAudio,
} from "@/lib/roleplay/tts";
import { CelebrationOverlay } from "@/components/roleplay/CelebrationOverlay";
import type { CelebrationVariant } from "@/components/roleplay/CelebrationOverlay";
import { EnvironmentBackdrop } from "@/components/roleplay/EnvironmentBackdrop";
import { getBCP47, getNativeLangBcp47 } from "@/lib/language";
import { ArrowLeft, Info, Volume2, VolumeX, X } from "lucide-react";

export default function AvatarModePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = Number(params.sessionId);

  const {
    session,
    scenario,
    character,
    conversations,
    phase,
    loading,
    error,
    isActive,
    isCompleted,
    goals,
    completedGoals,
    domain,
    situation,
    submitTurnStream,
    sendGreeting,
  } = useRoleplaySessionContext();

  const [targetLanguage, setTargetLanguage] = useState("ja");
  const [nativeLanguage, setNativeLanguage] = useState("en");
  const [avatarMode, setAvatarMode] = useState<
    "idle" | "listening" | "talking"
  >("idle");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [greetingSent, setGreetingSent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [mobileMsgOpen, setMobileMsgOpen] = useState(false);
  const [celebration, setCelebration] = useState<{
    variant: CelebrationVariant;
    title: string;
    subtitle?: string;
  } | null>(null);
  const lastAiCompletedRef = useRef<number>(Date.now());
  // Avatar web component manages its own internal state; no external emotion system ref needed
  const { status: connectionStatus } = useLatencyMonitor();

  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const targetLangRef = useRef("ja");
  const nativeLangRef = useRef("en");
  const phaseRef = useRef("");
  const sendingRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    targetLangRef.current = targetLanguage;
  }, [targetLanguage]);
  useEffect(() => {
    nativeLangRef.current = nativeLanguage;
  }, [nativeLanguage]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (session?.targetLanguage) setTargetLanguage(session.targetLanguage);
    if (session?.nativeLanguage) setNativeLanguage(session.nativeLanguage);
  }, [session]);

  useEffect(() => {
    stopTts();
    resetStreamingTts();
    return () => {
      stopTts();
      resetStreamingTts();
    };
  }, []);

  useEffect(() => {
    setOnSpeakingChange((speaking) => {
      speakingRef.current = speaking;
      setAvatarMode(speaking ? "talking" : "idle");
      if (!speaking) lastAiCompletedRef.current = Date.now();
    });
    return () => setOnSpeakingChange(null);
  }, []);

  function cleanDisplay(text: string): string {
    return text.replace(/【[^】]*】/g, "").trim();
  }

  const handleFinalTranscript = useCallback(
    async (text: string) => {
      if (sendingRef.current || !text.trim()) return;
      sendingRef.current = true;
      setSending(true);
      const responseTimeMs = Date.now() - lastAiCompletedRef.current;
      stopTts();
      resetStreamingTts();

      let fullText = "";

      try {
        await submitTurnStream(text.trim(), {
          responseTimeMs,
          onToken: (t) => {
            if (t) fullText = t;
            setStreamingText(t ? cleanDisplay(t) : null);
          },
          onRetry: (analysis) => {
            // Retry suggestions are not shown on the avatar interface.
          },
          onCelebration: () =>
            setCelebration({
              variant: "scenario-mastery",
              title: "Scenario Mastered!",
              subtitle: `You've completed every goal in "${situation?.title ?? scenario?.title ?? "this scenario"}".`,
            }),
          onComplete: (analysis) => {
            // Avatar component handles any visual/gesture behavior — no-op here.
          },
        });
        setStreamingText(null);

        // The avatar web component is the single speaker for this view, so avoid
        // triggering the app-level TTS path here and causing duplicate playback.
        const cleaned = cleanDisplay(fullText);
        if (!mutedRef.current && cleaned) {
          stopTts();
        }

        // Corrections are not shown on the avatar interface.
      } catch (e: any) {
        console.error(e);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [submitTurnStream, conversations],
  );

  const charName = character?.name ?? scenario?.aiCharacterName ?? "Assistant";
  const charColor = character?.avatarColor ?? "#2D3BC5";

  const latestConvo =
    conversations.length > 0 ? conversations[conversations.length - 1] : null;
  const latestAiConvo =
    [...conversations].reverse().find((c) => c.speaker === "ai") ?? null;

  // Auto-show mobile message sheet on new AI turns; auto-dismiss after 6s
  useEffect(() => {
    if (latestConvo?.speaker === "ai") {
      setMobileMsgOpen(true);
      const timer = setTimeout(() => setMobileMsgOpen(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [latestConvo?.id]);

  const handleReplay = useCallback(
    (turn: NonNullable<typeof latestAiConvo>) => {
      if (muted) return;
      stopTts();
      const t = turn.messageTarget || turn.messageNative;
      if (!t) return;
    },
    [muted],
  );

  const primaryGoal = situation?.learningGoals ?? scenario?.learningGoals ?? "";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-dojo-text-muted text-sm">
          Loading session…
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="text-dojo-text-muted text-sm">{error}</p>
        <button
          onClick={() => router.push("/home")}
          className="text-sm text-dojo-accent"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-b from-[#0a0a1a] via-[#0d0d24] to-[#111128]">
      <EnvironmentBackdrop domainSlug={domain?.slug} />
      <div className="relative z-20 flex items-center justify-between px-4 pt-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/home")}
            className="text-dojo-text-muted hover:text-dojo-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-dojo-text-primary">
            {scenario?.title ?? "Avatar"}
          </span>
          <PhaseIndicator phase={phase} />
          <ConnectionLatencyIndicator status={connectionStatus} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            className={`tap-target flex h-10 w-10 items-center justify-center rounded-full border ${muted ? "border-dojo-danger text-dojo-danger" : "border-white/10 text-dojo-text-muted"}`}
          >
            {muted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
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
        <div className="relative z-20 isolate flex-1 min-h-0 flex items-stretch justify-center bg-transparent">
<AvatarComponents
  instance={
    searchParams?.get("instance") ??
    session?.instanceId ??
    `session-${sessionId}`
  }
            settingsGroup={
              situation && character
                ? `${situation.id}-${character.id}`
                : undefined
            }
            backend={
              process.env.NEXT_PUBLIC_AVATAR_BACKEND_URL || "/api/avatar"
            }
            appId="ai-dojo"
            userId={session?.userId}
          />
        </div>
      </div>

      {/* Mobile message banner — compact, dismissible, semi-transparent */}
      {mobileMsgOpen && latestAiConvo && (
        <div className="md:hidden absolute bottom-20 left-3 right-3 z-30">
          <div className="rounded-xl border border-dojo-border/60 bg-dojo-surface/70 backdrop-blur-xl p-3 shadow-2xl flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug text-dojo-text-primary line-clamp-2">
                {streamingText ??
                  latestAiConvo.messageTarget ??
                  latestAiConvo.messageNative ??
                  ""}
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
                <span className="text-[10px] text-dojo-text-muted/60">
                  {charName}
                </span>
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

      {/* Bottom mic overlay removed — voice input and bottom mute control intentionally disabled */}

      <SessionInfoDrawer
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        domain={domain}
        situation={situation}
        scenario={scenario}
        session={session}
        character={character}
        charName={charName}
        charColor={charColor}
        goals={goals}
        completedGoals={completedGoals}
        isActive={isActive}
        isCompleted={isCompleted}
        targetLanguage={targetLanguage}
        nativeLanguage={nativeLanguage}
        correctionCount={conversations.reduce(
          (s, c) => s + (c.corrections?.length ?? 0),
          0,
        )}
        onEnd={async () => {
          await fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
          }).catch(() => {});
          router.push(`/sessions/${sessionId}/report`);
        }}
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