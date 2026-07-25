'use client';

import { useState, useEffect } from 'react';

type ConnectionStatus = 'good' | 'degraded' | 'offline';

interface ConnectionLatencyIndicatorProps {
  status?: ConnectionStatus;
  estimatedLatency?: number;
  className?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; bg: string; dot: string; text: string }> = {
  good: {
    label: 'Good — real-time',
    bg: 'bg-dojo-surface bg-opacity-80',
    dot: 'bg-[#3FB27F]',
    text: 'text-[#8FE2B5]',
  },
  degraded: {
    label: 'Degraded — slight delay',
    bg: 'bg-[#2A2210]',
    dot: 'bg-[#F2A93B]',
    text: 'text-[#F2CE8C]',
  },
  offline: {
    label: 'Offline — try voice',
    bg: 'bg-[#2A1416]',
    dot: 'bg-[#E5484D]',
    text: 'text-[#F0A0A3]',
  },
};

export function ConnectionLatencyIndicator({
  status = 'good',
  estimatedLatency,
  className = '',
}: ConnectionLatencyIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bg} ${className}`}
      style={{ borderColor: status === 'good' ? '#3FB27F' : status === 'degraded' ? '#F2A93B' : '#E5484D' }}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot} ${status === 'degraded' ? 'animate-pulse' : ''}`} />
      <span className={`text-[11px] font-semibold ${config.text}`}>{config.label}</span>
      {estimatedLatency !== undefined && (
        <span className="text-[10px] text-white/40 font-mono">{estimatedLatency}ms</span>
      )}
    </div>
  );
}

export function useLatencyMonitor(pingUrl: string = '/api/chat/stream'): {
  status: ConnectionStatus;
  estimatedLatency: number | undefined;
} {
  const [status, setStatus] = useState<ConnectionStatus>('good');
  const [estimatedLatency, setEstimatedLatency] = useState<number | undefined>(undefined);

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

  return { status, estimatedLatency };
}
