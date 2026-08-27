'use client';

import { useCallback, useEffect, useState } from 'react';

export type TryoutGateState = 'checking' | 'open' | 'blocked' | 'error';

export interface UseTryoutGateReturn {
  state: TryoutGateState;
  /** Milliseconds left on the 24h window, or null when the server didn't say. */
  retryAfterMs: number | null;
  /** Re-opens the gate after a `restart` response from the turn route. */
  restart: () => void;
}

/**
 * Opens a guest tryout against `/api/tryout/start`.
 *
 * Every tryout surface calls this — the mode chooser so it can show the
 * blocked screen before a learner picks a mode, and the voice/avatar pages
 * because either can be opened directly by URL.
 *
 * There is no id to hold on to: the preview's id lives in an httpOnly cookie
 * the server sets, so calling this again on the next page reuses the same
 * budget rather than opening a second one, and the client has nothing it
 * could tamper with.
 */
export function useTryoutGate(): UseTryoutGateReturn {
  const [state, setState] = useState<TryoutGateState>('checking');
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  // Bumped by `restart`, which is how a retry re-runs the effect rather than
  // duplicating the request/response mapping outside it.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const res = await fetch('/api/tryout/start', {
          method: 'POST',
          credentials: 'include',
        });
        const data = await res.json();
        if (cancelled) return;

        if (data.blocked) {
          setRetryAfterMs(typeof data.retryAfterMs === 'number' ? data.retryAfterMs : null);
          setState('blocked');
          return;
        }
        setState(res.ok ? 'open' : 'error');
      } catch {
        if (!cancelled) setState('error');
      }
    }

    open();
    return () => { cancelled = true; };
  }, [attempt]);

  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retryAfterMs, restart };
}
