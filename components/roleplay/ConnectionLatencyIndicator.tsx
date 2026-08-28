'use client';

import { useState, useEffect } from 'react';
import { subscribeTurnLatency } from '@/lib/roleplay/voice-latency';

type ConnectionStatus = 'good' | 'degraded' | 'offline';

interface ConnectionLatencyIndicatorProps {
  status?: ConnectionStatus;
  estimatedLatency?: number;
  /** Last measured mic-release → first-audio round trip, in ms. */
  turnLatency?: number;
  className?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; bg: string; border: string; dot: string; text: string }> = {
  good: {
    label: 'Good — real-time',
    bg: 'bg-dojo-success/10',
    border: 'border-dojo-success/40',
    dot: 'bg-dojo-success',
    text: 'text-dojo-success-strong',
  },
  degraded: {
    label: 'Degraded — slight delay',
    bg: 'bg-dojo-warning/10',
    border: 'border-dojo-warning/40',
    dot: 'bg-dojo-warning',
    text: 'text-dojo-warning-strong',
  },
  offline: {
    label: 'Offline — try voice',
    bg: 'bg-dojo-danger/10',
    border: 'border-dojo-danger/40',
    dot: 'bg-dojo-danger',
    text: 'text-dojo-danger-strong',
  },
};

export function ConnectionLatencyIndicator({
  status = 'good',
  estimatedLatency,
  turnLatency,
  className = '',
}: ConnectionLatencyIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bg} ${config.border} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot} ${status === 'degraded' ? 'animate-pulse' : ''}`} />
      <span className={`text-[11px] font-semibold ${config.text}`}>{config.label}</span>
      {estimatedLatency !== undefined && (
        <span className="text-[10px] text-dojo-text-muted font-mono">{estimatedLatency}ms</span>
      )}
      {turnLatency !== undefined && (
        // The number the learner actually feels: their release to the
        // character's first sound. The ping above only measures the network.
        <span
          className="text-[10px] text-dojo-text-muted font-mono"
          title="Mic release to first audio"
        >
          🎙{(turnLatency / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

export function useLatencyMonitor(pingUrl: string = '/api/chat/stream'): {
  status: ConnectionStatus;
  estimatedLatency: number | undefined;
  turnLatency: number | undefined;
} {
  const [status, setStatus] = useState<ConnectionStatus>('good');
  const [estimatedLatency, setEstimatedLatency] = useState<number | undefined>(undefined);
  const [turnLatency, setTurnLatency] = useState<number | undefined>(undefined);

  // The voice path's own end-to-end number, reported by lib/roleplay/voice-latency
  // when the character's first audio of a reply starts playing.
  useEffect(() => subscribeTurnLatency(setTurnLatency), []);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function check() {
      if (cancelled) return;
      const lastSent = Date.now();
      controller = new AbortController();
      const timer = setTimeout(() => controller?.abort(), 5000);
      try {
        const res = await fetch(pingUrl, {
          method: 'OPTIONS',
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (cancelled) return;
        if (!res.ok) throw new Error('Non-2xx');
        const elapsed = Date.now() - lastSent;
        setEstimatedLatency(elapsed);
        if (elapsed < 300) setStatus('good');
        else if (elapsed < 2000) setStatus('degraded');
        else setStatus('offline');
      } catch {
        if (!cancelled) {
          setStatus('offline');
          setEstimatedLatency(undefined);
        }
      }

      if (!cancelled) pollTimer = setTimeout(check, 10000);
    }

    check();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (controller) controller.abort();
    };
  }, [pingUrl]);

  return { status, estimatedLatency, turnLatency };
}
