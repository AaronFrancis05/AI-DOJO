'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getBCP47, getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { setVoiceGender } from '@/lib/roleplay/tts';

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

export interface SessionState {
  session: any;
  scenario: any;
  situation: any;
  domain: any;
  character: any;
  goals: GoalData[];
  conversations: TurnData[];
  completedGoals: number[];
  phase: string;
  loading: boolean;
  error: string;
  isActive: boolean;
  isCompleted: boolean;
}

export interface UseRoleplaySessionReturn extends SessionState {
  submitTurn: (input: string, responseTimeMs?: number) => Promise<void>;
  submitTurnStream: (input: string, options?: {
    isRetry?: boolean;
    responseTimeMs?: number;
    onToken?: (text: string) => void;
    onRetry?: (analysis: any) => void;
    onPhaseChange?: (phase: string) => void;
    onCelebration?: () => void;
    onComplete?: (analysis: any) => void;
  }) => Promise<void>;
  sendGreeting: (opts?: { onToken?: (t: string) => void }) => Promise<string>;
  pendingRetry: PendingRetry | null;
  retryCorrection: () => Promise<void>;
  dismissRetry: () => void;
}

function cleanDisplay(text: string): string {
  return text.replace(/【[^】]*】/g, '').trim();
}

export function useRoleplaySession(sessionId: number): UseRoleplaySessionReturn {
  const [session, setSession] = useState<any>(null);
  const [scenario, setScenario] = useState<any>(null);
  const [situation, setSituation] = useState<any>(null);
  const [domain, setDomain] = useState<any>(null);
  const [character, setCharacter] = useState<any>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [completedGoals, setCompletedGoals] = useState<number[]>([]);
  const [phase, setPhase] = useState<string>('icebreaker');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const targetLanguageRef = useRef('ja');
  const nativeLanguageRef = useRef('en');
  const isRetryRef = useRef(false);
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
        setScenario(data.scenario);
        setSituation(data.situation);
        setDomain(data.domain);
        setCharacter(data.character);
        setGoals(data.goals ?? []);
        setConversations((data.conversations ?? []).map((c: any) => ({
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
        })));
        if (data.goalCompletions) {
          setCompletedGoals(data.goalCompletions.map((gc: any) => gc.sequenceOrder));
        }
        if (data.session?.targetLanguage) targetLanguageRef.current = data.session.targetLanguage;
        if (data.session?.nativeLanguage) nativeLanguageRef.current = data.session.nativeLanguage;
        if (data.session?.phase) setPhase(data.session.phase);
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
      responseTimeMs?: number;
      onToken?: (text: string) => void;
      onRetry?: (analysis: any) => void;
      onPhaseChange?: (phase: string) => void;
      onCelebration?: () => void;
      onComplete?: (analysis: any) => void;
    },
  ) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    let optimisticId: number | null = null;
    if (trimmed !== '__session_start__') {
      optimisticId = Date.now();
      setConversations(prev => [...prev, { id: optimisticId!, turnNo: prev.length + 1, speaker: 'user', messageTarget: trimmed, messageNative: '', messagePhonetic: null, pending: true, receivedAt: Date.now() }]);
    }

    const rollback = () => {
      if (optimisticId) setConversations(prev => prev.map(t => t.id === optimisticId ? { ...t, pending: false, failed: true } : t));
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
          responseTimeMs: options?.responseTimeMs ?? 0,
        }),
      });
    } catch (e) {
      rollback();
      isRetryRef.current = false;
      throw e;
    }

    if (!res.ok) {
      rollback();
      isRetryRef.current = false;
      setPendingRetry(null);
      const errData = await res.json().catch(() => ({}));
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
            options?.onToken?.(collectedAiText);
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
            if (payload.celebration) options?.onCelebration?.();
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
      setSession((p: any) => ({ ...p, status: 'completed' }));
    }
  }, [sessionId, phase, conversations.length]);

  const sendGreeting = useCallback(async (opts?: { onToken?: (t: string) => void }) => {
    let fullText = '';
    await submitTurnStream('__session_start__', {
      onToken: (t) => { if (t) fullText = t; opts?.onToken?.(t); },
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

  return {
    session, scenario, situation, domain, character,
    goals, conversations, completedGoals, phase,
    loading, error, isActive, isCompleted,
    submitTurn, submitTurnStream, sendGreeting,
    pendingRetry, retryCorrection, dismissRetry,
  };
}
