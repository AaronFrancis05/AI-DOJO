/* ───────────────────────────────────────────────
   RealtimeProvider — one EventSource for the whole tab.

   Mounted once in the app shell. Components declare the topics they care
   about with `useRealtimeTopics`; the provider keeps the union of every
   declared topic on a single connection to /api/realtime.

   One connection, not one per feature, because a single page routinely wants
   three at once — the notification bell, the open chat room, and the
   assessment queue it is waiting in — and an HTTP/1.1 origin only allows six
   in total.

   ── The contract ──────────────────────────────────────────────────────
     onEvent   something changed on a topic — go and read it
     onSync    the connection just (re)opened — reconcile from the server

   `onSync` is not optional politeness. Pub/sub keeps no backlog: anything
   published while the socket was down is gone. Every consumer therefore
   fetches its own catch-up on connect, which is what makes this whole layer
   an optimisation that cannot break correctness — with the stream refusing
   to connect at all, the safety-net interval below still reconciles.
   ─────────────────────────────────────────────── */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isRealtimeEvent, type RealtimeEvent } from './topics';

/**
 * Reconciliation interval while the server reports a process-local fan-out
 * (no Redis configured), where a publish on another instance never reaches
 * this connection. Slow on purpose: a backstop, not the transport.
 */
const DEGRADED_SYNC_MS = 20_000;

/**
 * Reconciliation interval when the fan-out is durable. Still present,
 * because a silently half-open socket looks exactly like a quiet room.
 */
const HEALTHY_SYNC_MS = 120_000;

/**
 * Topic changes are coalesced before the connection is rebuilt — mounting a
 * page adds several subscriptions in the same tick and each one must not
 * cost a reconnect.
 */
const REBUILD_DEBOUNCE_MS = 150;

/** Matches MAX_TOPICS in app/api/realtime/route.ts. */
const MAX_TOPICS = 24;

export interface RealtimeSubscription {
  topics: string[];
  onEvent?: (event: RealtimeEvent, topic: string) => void;
  onSync?: () => void;
}

interface RealtimeContextValue {
  /** Registers a subscription; returns an unsubscribe. */
  register: (sub: RealtimeSubscription) => () => void;
  /** True once the server has confirmed a connection. */
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);

  // Subscriptions are held in a ref, not state: they change on every mount
  // and unmount, and re-rendering the whole app shell for that would be
  // absurd. The connection is rebuilt from an effect instead, keyed on a
  // version counter that only moves when the topic *set* actually changes.
  const subsRef = useRef(new Set<RealtimeSubscription>());
  const [topicVersion, setTopicVersion] = useState(0);
  const topicKeyRef = useRef('');

  const recomputeTopics = useCallback(() => {
    const union = new Set<string>();
    for (const sub of subsRef.current) {
      for (const topic of sub.topics) union.add(topic);
    }
    const next = [...union].sort().slice(0, MAX_TOPICS).join(',');
    if (next !== topicKeyRef.current) {
      topicKeyRef.current = next;
      setTopicVersion((v) => v + 1);
    }
  }, []);

  const register = useCallback(
    (sub: RealtimeSubscription) => {
      subsRef.current.add(sub);
      const timer = setTimeout(recomputeTopics, REBUILD_DEBOUNCE_MS);
      return () => {
        clearTimeout(timer);
        subsRef.current.delete(sub);
        setTimeout(recomputeTopics, REBUILD_DEBOUNCE_MS);
      };
    },
    [recomputeTopics],
  );

  useEffect(() => {
    const topicKey = topicKeyRef.current;
    if (!topicKey) {
      setConnected(false);
      return;
    }

    const source = new EventSource(`/api/realtime?topics=${encodeURIComponent(topicKey)}`);
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    const syncAll = () => {
      for (const sub of subsRef.current) sub.onSync?.();
    };

    const scheduleSync = (intervalMs: number) => {
      if (syncTimer) clearInterval(syncTimer);
      syncTimer = setInterval(syncAll, intervalMs);
    };

    // Until the server says otherwise, assume the worst about the fan-out.
    scheduleSync(DEGRADED_SYNC_MS);

    source.addEventListener('ready', (e) => {
      setConnected(true);
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          durable?: boolean;
          rejected?: string[];
        };
        if (data.rejected?.length) {
          // Logged, not thrown: one dead topic must not take the others with
          // it. The usual cause is a topic built from an id the user has just
          // lost access to.
          console.warn('[realtime] topics refused:', data.rejected.join(', '));
        }
        scheduleSync(data.durable ? HEALTHY_SYNC_MS : DEGRADED_SYNC_MS);
      } catch {
        /* keep the pessimistic interval */
      }
      syncAll();
    });

    source.addEventListener('message', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { topic?: string; event?: unknown };
        const { topic, event } = data;
        if (typeof topic !== 'string' || !isRealtimeEvent(event)) return;
        for (const sub of subsRef.current) {
          if (sub.topics.includes(topic)) sub.onEvent?.(event, topic);
        }
      } catch {
        /* malformed frame — the next sync reconciles */
      }
    });

    source.onerror = () => {
      setConnected(false);
      // EventSource reconnects on its own and the reopened connection
      // re-fires `ready`, which re-syncs. Until then, assume the worst.
      scheduleSync(DEGRADED_SYNC_MS);
    };

    return () => {
      if (syncTimer) clearInterval(syncTimer);
      source.close();
    };
    // topicVersion is the trigger; the key itself is read from the ref so a
    // recompute that lands on the same set never reconnects.
  }, [topicVersion]);

  const value = useMemo<RealtimeContextValue>(() => ({ register, connected }), [register, connected]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/**
 * Subscribe to realtime topics for as long as the component is mounted.
 *
 * Pass `null` for `topics` while the ids are still resolving — nothing is
 * registered until there is something real to listen to.
 *
 * Safe to call outside a RealtimeProvider: it becomes a no-op, so a
 * component can be rendered in the full-screen session shell (which has no
 * provider) without special-casing.
 */
export function useRealtimeTopics(
  topics: string[] | null,
  handlers: { onEvent?: (event: RealtimeEvent, topic: string) => void; onSync?: () => void },
) {
  const ctx = useContext(RealtimeContext);

  // Handlers go through refs so a caller passing inline closures does not
  // re-register (and therefore reconnect) on every render. Written from an
  // effect with no dependency array — it runs after every render, which is
  // what keeps the ref current without touching it during render.
  const onEventRef = useRef(handlers.onEvent);
  const onSyncRef = useRef(handlers.onSync);
  useEffect(() => {
    onEventRef.current = handlers.onEvent;
    onSyncRef.current = handlers.onSync;
  });

  // The dependency is the topic set, not the array identity.
  const topicKey = topics && topics.length > 0 ? [...topics].sort().join(',') : '';

  const register = ctx?.register;

  useEffect(() => {
    if (!register || !topicKey) return;
    return register({
      topics: topicKey.split(','),
      onEvent: (event, topic) => onEventRef.current?.(event, topic),
      onSync: () => onSyncRef.current?.(),
    });
  }, [register, topicKey]);

  return { connected: ctx?.connected ?? false };
}
