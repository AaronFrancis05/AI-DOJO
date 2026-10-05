'use client';

import { useCallback, useRef, useState } from 'react';
import type { TurnData } from '@/lib/hooks/useRoleplaySession';

export interface UseOnboardingPracticeOptions {
  domainId: number;
  level: string;
  targetLanguage: string;
  nativeLanguage: string;
}

export interface UseOnboardingPracticeReturn {
  conversations: TurnData[];
  sending: boolean;
  limitReached: boolean;
  completed: boolean;
  error: string;
  sendGreeting: (opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void | Promise<void> }) => Promise<void>;
  submitTurnStream: (input: string, opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void | Promise<void> }) => Promise<void>;
}

/**
 * The in-wizard sample conversation. Budget and scene live on
 * `/api/onboarding/turn`; this hook only holds the transcript for the sitting.
 */
export function useOnboardingPracticeSession({
  domainId,
  level,
  targetLanguage,
  nativeLanguage,
}: UseOnboardingPracticeOptions): UseOnboardingPracticeReturn {
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const historyRef = useRef<{ speaker: 'user' | 'ai'; text: string }[]>([]);
  const started = useRef(false);

  const requestTurn = useCallback(async (
    userMessage: string,
    opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void | Promise<void> },
  ) => {
    setSending(true);
    setError('');
    try {
      const restart = !started.current;
      started.current = true;
      const res = await fetch('/api/onboarding/turn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domainId,
          level,
          targetLanguage,
          nativeLanguage,
          history: historyRef.current,
          userMessage,
          restart,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `Practice request failed (${res.status})`);
      }

      if (userMessage.trim()) {
        historyRef.current.push({ speaker: 'user', text: userMessage.trim() });
        setConversations((prev) => [...prev, {
          id: Date.now(), turnNo: prev.length + 1, speaker: 'user',
          messageTarget: userMessage.trim(), messageNative: '', messagePhonetic: null,
          receivedAt: Date.now(),
        }]);
      }

      if (data.replyTarget) {
        opts?.onToken?.(data.replyTarget);
        historyRef.current.push({ speaker: 'ai', text: data.replyTarget });
        setConversations((prev) => [...prev, {
          id: Date.now() + 1, turnNo: prev.length + 1, speaker: 'ai',
          messageTarget: data.replyTarget, messageNative: data.replyNative ?? '', messagePhonetic: null,
          receivedAt: Date.now(),
        }]);
        // The Nice work overlay unmounts this sitting and stop()s TTS. Paint
        // the last reply and wait for it to be heard before flipping completed.
        const spoken = Promise.resolve(opts?.onTextDone?.(data.replyTarget)).catch(() => {});
        if (data.completed || data.limitReached) await spoken;
      }

      if (data.limitReached) setLimitReached(true);
      if (data.completed) setCompleted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      throw e;
    } finally {
      setSending(false);
    }
  }, [domainId, level, targetLanguage, nativeLanguage]);

  const sendGreeting = useCallback(async (opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void | Promise<void> }) => {
    await requestTurn('', opts);
  }, [requestTurn]);

  const submitTurnStream = useCallback(async (
    input: string,
    opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void | Promise<void> },
  ) => {
    const trimmed = input.trim();
    if (!trimmed || limitReached) return;
    await requestTurn(trimmed, opts);
  }, [requestTurn, limitReached]);

  return { conversations, sending, limitReached, completed, error, sendGreeting, submitTurnStream };
}
