'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatSessionClock } from '@/lib/roleplay/session-lifecycle';

const FLUSH_INTERVAL_MS = 30_000;

function snapshot(accumulated: number, segmentStart: number | null): number {
  if (segmentStart == null) return accumulated;
  return accumulated + Math.max(0, Math.floor((Date.now() - segmentStart) / 1000));
}

/**
 * Accumulates Session Time only while `enabled` and the tab is visible.
 * Voice ⇄ avatar stays enabled (same provider), so switching modes does not
 * freeze the clock. Parent persists via `onFlush`.
 */
export function useSessionClock({
  sessionId,
  enabled,
  initialSeconds,
  onFlush,
}: {
  sessionId: number;
  enabled: boolean;
  initialSeconds: number;
  onFlush: (seconds: number) => void;
}): {
  elapsedSeconds: number;
  elapsedLabel: string;
  commit: () => number;
} {
  const accumulatedRef = useRef(Math.max(0, initialSeconds));
  const segmentStartRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const onFlushRef = useRef(onFlush);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.max(0, initialSeconds));

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  const lastSeedRef = useRef<{ id: number; seconds: number } | null>(null);
  useEffect(() => {
    const prev = lastSeedRef.current;
    const incoming = Math.max(0, initialSeconds);
    if (prev?.id === sessionId && prev.seconds === incoming) return;
    const local = snapshot(accumulatedRef.current, segmentStartRef.current);
    // A heartbeat round-trip can echo a slightly stale persisted value;
    // never rewind the live clock for the same session.
    if (prev?.id === sessionId && incoming < local) {
      lastSeedRef.current = { id: sessionId, seconds: incoming };
      return;
    }
    lastSeedRef.current = { id: sessionId, seconds: incoming };
    accumulatedRef.current = incoming;
    segmentStartRef.current = enabledRef.current ? Date.now() : null;
    setElapsedSeconds(incoming);
  }, [sessionId, initialSeconds]);

  const commit = useCallback(() => {
    const total = snapshot(accumulatedRef.current, segmentStartRef.current);
    accumulatedRef.current = total;
    segmentStartRef.current = enabledRef.current ? Date.now() : null;
    setElapsedSeconds(total);
    return total;
  }, []);

  useEffect(() => {
    const applyVisibility = () => {
      const visible = document.visibilityState === 'visible';
      const shouldRun = enabled && visible;
      if (shouldRun) {
        if (segmentStartRef.current == null) segmentStartRef.current = Date.now();
        return;
      }
      const total = snapshot(accumulatedRef.current, segmentStartRef.current);
      accumulatedRef.current = total;
      segmentStartRef.current = null;
      setElapsedSeconds(total);
      onFlushRef.current(total);
    };

    applyVisibility();
    document.addEventListener('visibilitychange', applyVisibility);
    const onPageHide = () => {
      const total = snapshot(accumulatedRef.current, segmentStartRef.current);
      accumulatedRef.current = total;
      segmentStartRef.current = null;
      onFlushRef.current(total);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', applyVisibility);
      window.removeEventListener('pagehide', onPageHide);
      onPageHide();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      setElapsedSeconds(snapshot(accumulatedRef.current, segmentStartRef.current));
    };
    tick();
    const interval = setInterval(tick, 1000);
    const heartbeat = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const total = commit();
      onFlushRef.current(total);
    }, FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      clearInterval(heartbeat);
    };
  }, [enabled, commit]);

  return {
    elapsedSeconds,
    elapsedLabel: formatSessionClock(elapsedSeconds),
    commit,
  };
}
