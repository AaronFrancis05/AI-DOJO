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
  error: string;
  sendGreeting: (opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void }) => Promise<void>;
  submitTurnStream: (input: string, opts?: { onToken?: (t: string) => void; onTextDone?: (t: string) => void }) => Promise<void>;
}

export function useGuestRoleplaySession({ targetLanguage, nativeLanguage }: UseGuestRoleplaySessionOptions): UseGuestRoleplaySessionReturn {
  const [conversations, setConversations] = useState<TurnData[]>([]);
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [completed, setCompleted] = useState(false);
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetLanguage,
          nativeLanguage,
          history: historyRef.current,
          userMessage,
        }),
      });
      const data = await res.json();
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
    if (!trimmed || limitReached) return;
    await requestTurn(trimmed, opts);
  }, [requestTurn, limitReached]);

  return { conversations, sending, limitReached, completed, error, sendGreeting, submitTurnStream };
}
