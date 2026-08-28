'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AvatarSource } from '@/lib/avatar/catalog';
import { getTargetLangConfig } from '@/lib/language';
import { setVoiceGender } from '@/lib/roleplay/tts';
import { cleanDisplay } from '@/lib/roleplay/clean-display';

export interface TurnData {
  id: number;
  turnNo: number;
  speaker: 'user' | 'ai';
  messageTarget: string;
  messageNative: string;
  messagePhonetic: string | null;
  emotionTone?: string;
  gestureHint?: string;
  corrections?: any[];
  pending?: boolean;
  failed?: boolean;
  audioUrl?: string | null;
  audioStatus?: string | null;
  receivedAt?: number;
}

export interface PendingRetry {
  correctedText: string;
  correctedPhonetic?: string | null;
  originalText: string;
  explanation: string;
  severity: string;
  suggestedReplies: string[];
}

function buildPendingRetry(analysis: any): PendingRetry | null {
  const corrections = analysis?.corrections ?? [];
  const first = corrections.find((c: any) => c.correctedText) ?? corrections[0];
  if (!first?.correctedText) return null;
  return {
    correctedText: first.correctedText,
    correctedPhonetic: first.correctedPhonetic ?? null,
    originalText: first.originalText ?? '',
    explanation: first.explanation ?? '',
    severity: first.severity ?? 'minor',
    suggestedReplies: analysis?.suggestedReplies ?? [],
  };
}

export interface GoalData {
  id: number;
  sequenceOrder: number;
  goalText: string;
  goalType: string;
}

export interface PhaseTransitionEvent {
  fromPhase: string;
  toPhase: string;
  message: string;
}

/**
 * A welcome-back line generated for a learner returning after a long gap.
 * Raised as an event rather than only appended to `conversations` because the
 * character has to *say* it: speech is driven by the session views (they own
 * the mute state, the caption overlay, and the TTS voices), and nothing in the
 * views watches the transcript for new AI turns.
 */
export interface RecapEvent {
  /** Matches the appended turn's id, so a view can locate it in the transcript. */
  id: number;
  text: string;
}

/**
 * Where the learner goes after a curriculum lesson. Null for free practice,
 * which keeps its /home exit — resolved server-side so the completion screen
 * and the course page can't disagree about which lesson is unlocked next.
 */
export interface NextLessonTarget {
  courseSlug: string;
  unitId: number;
  unitTitle: string;
  nextLessonId: number | null;
  nextLessonTitle: string | null;
  unitCompleted: boolean;
  levelCompleted: boolean;
}

export interface SessionState {
  session: any;
  nextLesson: NextLessonTarget | null;
  scenario: any;
  situation: any;
  domain: any;
  character: any;
  selectedAvatar: AvatarSource | null;
  goals: GoalData[];
  conversations: TurnData[];
  completedGoals: number[];
  phase: string;
  loading: boolean;
  error: string;
  isActive: boolean;
  isCompleted: boolean;
  phaseTransition: PhaseTransitionEvent | null;
  recap: RecapEvent | null;
  unacknowledgedCompletion: boolean;
  evaluation: any | null;
  avgPronunciationScore: number | null;
  newWordsCount: number | null;
}

export interface UseRoleplaySessionReturn extends SessionState {
  submitTurn: (input: string, responseTimeMs?: number) => Promise<void>;
  submitTurnStream: (input: string, options?: {
    isRetry?: boolean;
    accuracyScore?: number;
    responseTimeMs?: number;
    /** Cumulative reply text so far — for rendering the streaming caption. */
    onToken?: (text: string) => void;
    /**
     * Just-arrived text, not the accumulated string. Speech synthesis has to
     * consume the reply incrementally, so it needs the delta rather than the
     * running total `onToken` reports.
     */
    onTokenDelta?: (delta: string) => void;
    onTextDone?: (text: string) => void;
    /**
     * A gesture read off the reply text server-side and sent right after
     * `text_done`, so it can play as speech starts rather than after it. The
     * model's own hint still follows on `onComplete`.
     */
    onGesture?: (gesture: string) => void;
    onRetry?: (analysis: any) => void;
    onPhaseChange?: (phase: string) => void;
    onPhaseTransition?: (transition: PhaseTransitionEvent) => void;
    onCelebration?: (info?: { variant?: string; passed?: boolean; score?: number; xpGained?: number; newStreak?: number }) => void;
    onComplete?: (analysis: any) => void;
  }) => Promise<void>;
  sendGreeting: (opts?: {
    onToken?: (t: string) => void;
    onTokenDelta?: (delta: string) => void;
    onTextDone?: (t: string) => void;
    onGesture?: (gesture: string) => void;
  }) => Promise<string>;
  pendingRetry: PendingRetry | null;
  retryCorrection: () => Promise<void>;
  dismissRetry: () => void;
  dismissPhaseTransition: () => void;
  dismissRecap: () => void;
  acknowledgeCompletion: () => Promise<void>;
}

export function useRoleplaySession(sessionId: number): UseRoleplaySessionReturn {
  const [session, setSession] = useState<any>(null);
  const [nextLesson, setNextLesson] = useState<NextLessonTarget | null>(null);
  const [scenario, setScenario] = useState<any>(null);
  const [situation, setSituation] = useState<any>(null);
  const [domain, setDomain] = useState<any>(null);
  const [character, setCharacter] = useState<any>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarSource | null>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [completedGoals, setCompletedGoals] = useState<number[]>([]);
  const [phase, setPhase] = useState<string>('orientation');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phaseTransition, setPhaseTransition] = useState<PhaseTransitionEvent | null>(null);
  const [recap, setRecap] = useState<RecapEvent | null>(null);
  const [unacknowledgedCompletion, setUnacknowledgedCompletion] = useState(false);
  const [evaluation, setEvaluation] = useState<any | null>(null);
  const [avgPronunciationScore, setAvgPronunciationScore] = useState<number | null>(null);
  const [newWordsCount, setNewWordsCount] = useState<number | null>(null);
  const targetLanguageRef = useRef('ja');
  const nativeLanguageRef = useRef('en');
  const isRetryRef = useRef(false);
  // Read inside submitTurnStream, which callers hold across renders — the
  // `session` state itself would be a stale closure there.
  const sessionStatusRef = useRef<string | null>(null);
  const lastAiCompletedRef = useRef<number>(Date.now());
  const [pendingRetry, setPendingRetry] = useState<PendingRetry | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Session not found'); }
        const data = await res.json();
        setVoiceGender(data.session?.voiceGender || data.character?.gender || 'Female');
        setSession(data.session);
        setNextLesson(data.nextLesson ?? null);
        sessionStatusRef.current = data.session?.status ?? null;
        setScenario(data.scenario);
        setSituation(data.situation);
        setDomain(data.domain);
        setCharacter(data.character);
        setSelectedAvatar(data.selectedAvatar ?? null);
        setGoals(data.goals ?? []);
        const convList: TurnData[] = (data.conversations ?? []).map((c: any) => ({
          id: c.id,
          turnNo: c.turnNo,
          speaker: c.speaker,
          messageTarget: cleanDisplay(c.messageTarget ?? c.messageJp),
          messageNative: c.messageNative ?? c.messageEn,
          messagePhonetic: c.messagePhonetic,
          emotionTone: c.emotionTone,
          gestureHint: c.gestureHint,
          corrections: c.corrections ?? [],
          audioUrl: c.audioUrl,
          audioStatus: c.audioStatus,
        }));
        setConversations(convList);
        if (data.goalCompletions) {
          setCompletedGoals(data.goalCompletions.map((gc: any) => gc.sequenceOrder));
        }
        setEvaluation(data.evaluation ?? null);
        setAvgPronunciationScore(typeof data.avgPronunciationScore === 'number' ? data.avgPronunciationScore : null);
        setNewWordsCount(typeof data.newWordsCount === 'number' ? data.newWordsCount : null);
        if (data.session?.targetLanguage) targetLanguageRef.current = data.session.targetLanguage;
        if (data.session?.nativeLanguage) nativeLanguageRef.current = data.session.nativeLanguage;
        if (data.session?.phase) setPhase(data.session.phase);

        // Check if completion was unacknowledged
        if (data.session?.status === 'completed' && !data.session?.completionAcknowledged) {
          setUnacknowledgedCompletion(true);
        }

        // Reconnect / Recap gap calculation (> 5 minutes)
        const lastActiveTime = data.session?.lastActiveAt ? new Date(data.session.lastActiveAt).getTime() : 0;
        const gapMs = lastActiveTime ? Date.now() - lastActiveTime : 0;
        if (gapMs > 5 * 60 * 1000 && data.session?.status === 'active' && data.session?.phase !== 'orientation') {
          fetch(`/api/sessions/${sessionId}/recap`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
          })
            .then(r => r.json())
            .then(body => {
              if (body.recapNeeded && body.recapText) {
                const recapTurn: TurnData = {
                  id: Date.now(),
                  turnNo: convList.length + 1,
                  speaker: 'ai',
                  messageTarget: cleanDisplay(body.recapText),
                  messageNative: body.recapText,
                  messagePhonetic: null,
                  receivedAt: Date.now(),
                };
                setConversations(prev => [...prev, recapTurn]);
                // The transcript entry alone is silent — the views speak the
                // character's lines, and they only ever see reply text through
                // the streaming callbacks. Raise it as an event so the recap is
                // recited like any other thing the character says.
                setRecap({ id: recapTurn.id, text: body.recapText });
              }
            })
            .catch(err => console.warn('[RECAP] failed to fetch recap:', err));
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  const targetLanguage = targetLanguageRef.current;
  const nativeLanguage = nativeLanguageRef.current;
  const isActive = session?.status === 'active' || session?.status === 'paused';
  const isCompleted = session?.status === 'completed';

  const targetLangName = getTargetLangConfig(targetLanguage).name;

  /**
   * Bring local state in line with a session the server considers finished and
   * pull the final evaluation. `announce` is for completions this client did
   * not drive (another tab, a turn that finished while this one was in flight):
   * the session really is over, so the completion screen has to be raised here
   * rather than by the celebration flow that never ran.
   */
  const syncCompletedSession = useCallback(async (announce: boolean) => {
    sessionStatusRef.current = 'completed';
    setSession((p: any) => (p ? { ...p, status: 'completed' } : p));
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
      const data = await res.json();
      setEvaluation(data.evaluation ?? null);
      setAvgPronunciationScore(typeof data.avgPronunciationScore === 'number' ? data.avgPronunciationScore : null);
      setNewWordsCount(typeof data.newWordsCount === 'number' ? data.newWordsCount : null);
      // Re-read rather than trusting the copy from page load: the lesson only
      // flips to 'completed' as part of this completion, so the target loaded
      // at mount still points at the lesson the learner just finished.
      setNextLesson(data.nextLesson ?? null);
      if (announce && data.session && !data.session.completionAcknowledged) {
        setUnacknowledgedCompletion(true);
      }
    } catch { /* the completion screen falls back to the session's own scores */ }
  }, [sessionId]);

  const submitTurn = useCallback(async (input: string, responseTimeMs?: number) => {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        userRawInput: input,
        isRetryOfPreviousMistake: isRetryRef.current,
        responseTimeMs: responseTimeMs ?? 0,
      }),
    });
    if (!res.ok) throw new Error(`Chat request failed (${res.status})`);
  }, [sessionId]);

  const submitTurnStream = useCallback(async (
    input: string,
    options?: {
      isRetry?: boolean;
      accuracyScore?: number;
      responseTimeMs?: number;
      onToken?: (text: string) => void;
      onTokenDelta?: (delta: string) => void;
      onTextDone?: (text: string) => void;
      onGesture?: (gesture: string) => void;
      onRetry?: (analysis: any) => void;
      onPhaseChange?: (phase: string) => void;
      onPhaseTransition?: (transition: PhaseTransitionEvent) => void;
      onCelebration?: (info?: { variant?: string; passed?: boolean; score?: number; xpGained?: number; newStreak?: number }) => void;
      onComplete?: (analysis: any) => void;
    },
  ) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // A finished session takes no further turns — /api/chat/stream rejects them
    // with a 400. UI that outlives the final turn (a coach suggestion chip, a
    // mic release that lands after the session completed) could still call in
    // here, and the rejection surfaced to the learner as a thrown
    // "Session is already completed" instead of their results screen.
    if (sessionStatusRef.current === 'completed') return;

    let optimisticId: number | null = null;
    if (trimmed !== '__session_start__') {
      optimisticId = Date.now();
      setConversations(prev => [...prev, { id: optimisticId!, turnNo: prev.length + 1, speaker: 'user', messageTarget: trimmed, messageNative: '', messagePhonetic: null, pending: true, receivedAt: Date.now() }]);
    }

    const rollback = () => {
      if (optimisticId) setConversations(prev => prev.map(t => t.id === optimisticId ? { ...t, pending: false, failed: true } : t));
    };
    const dropOptimistic = () => {
      if (optimisticId) setConversations(prev => prev.filter(t => t.id !== optimisticId));
    };

    let res: Response;
    try {
      res = await fetch('/api/chat/stream', {
        credentials: 'include',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userRawInput: trimmed,
          isRetryOfPreviousMistake: options?.isRetry ?? isRetryRef.current,
          accuracyScore: options?.accuracyScore,
          responseTimeMs: options?.responseTimeMs ?? 0,
        }),
      });
    } catch (e) {
      rollback();
      isRetryRef.current = false;
      throw e;
    }

    if (!res.ok) {
      isRetryRef.current = false;
      setPendingRetry(null);
      const errData = await res.json().catch(() => ({}));
      // The session finished server-side without this client knowing. The turn
      // was never accepted, so drop it rather than leaving a failed bubble, and
      // show the learner the completion they actually reached.
      if (res.status === 400 && errData.error === 'Session is already completed') {
        dropOptimistic();
        syncCompletedSession(true);
        return;
      }
      rollback();
      throw new Error(errData.error || `Chat request failed (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) { rollback(); throw new Error('No response body'); }

    const decoder = new TextDecoder();
    let buffer = '';
    let collectedAiText = '';
    let finalPhase: string | null = null;
    let finalAnalysis: any = null;
    let isRetryResponse = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let payload: any;
        try { payload = JSON.parse(line.slice(6)); } catch { continue; }

        switch (payload.type) {
          case 'token':
            collectedAiText += payload.text;
            options?.onTokenDelta?.(payload.text);
            options?.onToken?.(collectedAiText);
            break;
          case 'text_done':
            if (payload.fullText) collectedAiText = payload.fullText;
            options?.onTextDone?.(payload.fullText ?? '');
            break;
          case 'gesture':
            if (payload.gesture) options?.onGesture?.(payload.gesture);
            break;
          case 'phase_transition':
            setPhase(payload.toPhase);
            options?.onPhaseChange?.(payload.toPhase);
            {
              const transitionData: PhaseTransitionEvent = {
                fromPhase: payload.fromPhase,
                toPhase: payload.toPhase,
                message: payload.message ?? '',
              };
              setPhaseTransition(transitionData);
              options?.onPhaseTransition?.(transitionData);
            }
            break;
          case 'retry':
            isRetryResponse = true;
            isRetryRef.current = true;
            finalAnalysis = payload.analysis;
            setPendingRetry(buildPendingRetry(payload.analysis));
            options?.onRetry?.(payload.analysis);
            break;
          case 'done':
            lastAiCompletedRef.current = Date.now();
            isRetryRef.current = false;
            finalPhase = payload.phase;
            finalAnalysis = payload.analysis;
            setPendingRetry(null);
            if (payload.celebration) {
              options?.onCelebration?.({
                variant: payload.celebrationVariant ?? (payload.passed === false ? 'needs-practice' : 'scenario-mastery'),
                passed: payload.passed ?? true,
                score: payload.compositeScore ?? 0,
                xpGained: payload.xpGained,
                newStreak: payload.newStreak,
              });
            }
            options?.onComplete?.(payload.analysis);
            break;
          case 'error':
            isRetryRef.current = false;
            setPendingRetry(null);
            rollback();
            throw new Error(payload.message || 'Stream error');
        }
      }
    }

    if (finalPhase) {
      if (finalPhase !== phase) options?.onPhaseChange?.(finalPhase);
      setPhase(finalPhase);
    }

    if (isRetryResponse && finalAnalysis) {
      const userTurn: TurnData = {
        id: Date.now(), turnNo: conversations.length + 1, speaker: 'user',
        messageTarget: finalAnalysis.messageTarget ?? trimmed,
        messageNative: finalAnalysis.messageNative ?? '',
        messagePhonetic: finalAnalysis.messagePhonetic,
        emotionTone: finalAnalysis.emotionTone,
        gestureHint: finalAnalysis.gestureHint,
        corrections: finalAnalysis.corrections ?? [],
        receivedAt: Date.now(),
      };
      setConversations(prev => {
        const idx = prev.findIndex(t => t.pending);
        if (idx === -1) return [...prev, userTurn];
        const updated = [...prev];
        updated[idx] = { ...userTurn, pending: false };
        return updated;
      });
      return;
    }

    if (trimmed === '__session_start__') {
      setConversations(prev => [...prev, {
        id: Date.now(), turnNo: 0, speaker: 'ai' as const,
        messageTarget: cleanDisplay(collectedAiText), messageNative: '', messagePhonetic: null,
        receivedAt: Date.now(),
      }]);
    } else {
      const userTurn: TurnData = {
        id: Date.now(), turnNo: conversations.length + 1, speaker: 'user',
        messageTarget: finalAnalysis?.messageTarget ?? trimmed,
        messageNative: finalAnalysis?.messageNative ?? '',
        messagePhonetic: finalAnalysis?.messagePhonetic,
        emotionTone: finalAnalysis?.emotionTone,
        gestureHint: finalAnalysis?.gestureHint,
        corrections: finalAnalysis?.corrections ?? [],
        receivedAt: Date.now(),
      };
      const aiTurn: TurnData = {
        id: Date.now() + 1, turnNo: conversations.length + 1, speaker: 'ai',
        messageTarget: cleanDisplay(collectedAiText), messageNative: '', messagePhonetic: null,
        receivedAt: Date.now(),
      };
      setConversations(prev => {
        const idx = prev.findIndex(t => t.pending);
        if (idx === -1) return [...prev, userTurn, aiTurn];
        const updated = [...prev];
        updated[idx] = { ...userTurn, pending: false };
        updated.splice(idx + 1, 0, aiTurn);
        return updated;
      });
    }

    if (finalAnalysis?.goalsAddressedThisTurn?.length > 0) {
      setCompletedGoals(prev => [...new Set([...prev, ...finalAnalysis.goalsAddressedThisTurn])]);
    }

    if (finalAnalysis?.scenarioComplete) {
      // Not announced: this client drove the completion, so the celebration
      // flow raises the results screen once the farewell has finished playing.
      syncCompletedSession(false);
    }
  }, [sessionId, phase, conversations.length, syncCompletedSession]);

  const sendGreeting = useCallback(async (opts?: {
    onToken?: (t: string) => void;
    onTokenDelta?: (delta: string) => void;
    onTextDone?: (t: string) => void;
    onGesture?: (gesture: string) => void;
  }) => {
    let fullText = '';
    await submitTurnStream('__session_start__', {
      onToken: (t) => { if (t) fullText = t; opts?.onToken?.(t); },
      onTokenDelta: (delta) => opts?.onTokenDelta?.(delta),
      onTextDone: (t) => { if (t) fullText = t; opts?.onTextDone?.(t); },
      onGesture: (g) => opts?.onGesture?.(g),
    });
    return fullText;
  }, [submitTurnStream]);

  const retryCorrection = useCallback(async () => {
    const target = pendingRetry?.correctedText;
    if (!target) return;
    setPendingRetry(null);
    await submitTurnStream(target, { isRetry: true });
  }, [pendingRetry, submitTurnStream]);

  const dismissRetry = useCallback(() => setPendingRetry(null), []);

  const dismissPhaseTransition = useCallback(() => setPhaseTransition(null), []);

  const dismissRecap = useCallback(() => setRecap(null), []);

  const acknowledgeCompletion = useCallback(async () => {
    setUnacknowledgedCompletion(false);
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completionAcknowledged: true }),
    }).catch(() => {});
  }, [sessionId]);

  return {
    session, nextLesson, scenario, situation, domain, character, selectedAvatar,
    goals, conversations, completedGoals, phase,
    loading, error, isActive, isCompleted,
    phaseTransition, recap, unacknowledgedCompletion,
    evaluation, avgPronunciationScore, newWordsCount,
    submitTurn, submitTurnStream, sendGreeting,
    pendingRetry, retryCorrection, dismissRetry,
    dismissPhaseTransition, dismissRecap, acknowledgeCompletion,
  };
}
