'use client';

import { useCallback, useRef, useState } from 'react';
import type { TurnData } from '@/lib/hooks/useRoleplaySession';

export interface UseGuestRoleplaySessionOptions {
  targetLanguage: string;
  nativeLanguage: string;
}

export interface UseGuestRoleplaySessionReturn {
  conversations: TurnData[];
  sending: boolean;
  limitReached: boolean;
  completed: boolean;
  /** The 24h gate closed mid-session (or the preview id expired). */
  blocked: boolean;
  blockedRetryAfterMs: number | null;
  error: string;
  sendGreeting: (opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void }) => Promise<void>;
  submitTurnStream: (input: string, opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void }) => Promise<void>;
}

/**
 * The guest preview's conversation loop.
 *
 * The turn budget is not passed in and not tracked here: `/api/tryout/turn`
 * counts it against the id in the httpOnly cookie that `useTryoutGate`'s call
 * to `/api/tryout/start` set. `credentials: 'include'` is what carries it.
 */
export function useGuestRoleplaySession({ targetLanguage, nativeLanguage }: UseGuestRoleplaySessionOptions): UseGuestRoleplaySessionReturn {
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockedRetryAfterMs, setBlockedRetryAfterMs] = useState<number | null>(null);
  const [error, setError] = useState('');
  const historyRef = useRef<{ speaker: 'user' | 'ai'; text: string }[]>([]);

  const requestTurn = useCallback(async (
    userMessage: string,
    opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void },
  ) => {
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/tryout/turn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetLanguage,
          nativeLanguage,
          history: historyRef.current,
          userMessage,
        }),
      });
      const data = await res.json();

      // The 24h gate closed, or the preview id expired — either way this is
      // not a failure to show as a red error banner, it is the end of the
      // preview and the blocked screen is the right surface for it.
      if (data.blocked || data.restart) {
        setBlockedRetryAfterMs(typeof data.retryAfterMs === 'number' ? data.retryAfterMs : null);
        setBlocked(true);
        return;
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `Tryout request failed (${res.status})`);
      }

      if (userMessage.trim()) {
        historyRef.current.push({ speaker: 'user', text: userMessage.trim() });
        setConversations(prev => [...prev, {
          id: Date.now(), turnNo: prev.length + 1, speaker: 'user',
          messageTarget: userMessage.trim(), messageNative: '', messagePhonetic: null,
          receivedAt: Date.now(),
        }]);
      }

      if (data.limitReached) {
        setLimitReached(true);
      }
      if (data.completed) {
        setCompleted(true);
      }

      if (data.replyTarget) {
        opts?.onToken?.(data.replyTarget);
        opts?.onTextDone?.(data.replyTarget);
        historyRef.current.push({ speaker: 'ai', text: data.replyTarget });
        setConversations(prev => [...prev, {
          id: Date.now() + 1, turnNo: prev.length + 1, speaker: 'ai',
          messageTarget: data.replyTarget, messageNative: data.replyNative ?? '', messagePhonetic: null,
          receivedAt: Date.now(),
        }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      throw e;
    } finally {
      setSending(false);
    }
  }, [targetLanguage, nativeLanguage]);

  const sendGreeting = useCallback(async (opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void }) => {
    await requestTurn('', opts);
  }, [requestTurn]);

  const submitTurnStream = useCallback(async (
    input: string,
    opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void },
  ) => {
    const trimmed = input.trim();
    if (!trimmed || limitReached || blocked) return;
    await requestTurn(trimmed, opts);
  }, [requestTurn, limitReached, blocked]);

  return { conversations, sending, limitReached, completed, blocked, blockedRetryAfterMs, error, sendGreeting, submitTurnStream };
}
