/**
 * The realtime fan-out. Server-only.
 *
 * Replaces the 3-second poll the messaging UI used to run. One publisher
 * (whichever route handler changed something) and one long-lived subscriber
 * per connected browser tab, instead of every tab asking every room every
 * three seconds whether anything happened.
 *
 * ── Transport ─────────────────────────────────────────────────────────
 * Upstash Redis pub/sub, which the project already depends on for caching:
 *   publish   POST {UPSTASH_REDIS_URL}/publish/{channel}   body = payload
 *   subscribe GET  {UPSTASH_REDIS_URL}/subscribe/{a,b,c}   text/event-stream
 *
 * Upstash frames each delivery as one SSE line:
 *   data: message,{channel},{payload}
 * so payloads are base64 so that a newline or a comma in the JSON cannot
 * split a frame. Deliberately not the path form (`/publish/{ch}/{msg}`) —
 * that puts the payload in a URL.
 *
 * ── When Redis is not configured ──────────────────────────────────────
 * Falls back to an in-process emitter. That is correct for local dev (one
 * Node process) and wrong across instances, which is why `isFanOutDurable()`
 * exists: the SSE route reports the mode to the client, and the client keeps
 * a slow reconciliation poll running when the fan-out is process-local.
 *
 * ── What this is not ──────────────────────────────────────────────────
 * Not a queue and not a cache. A subscriber that is not connected when an
 * event is published never sees it. Every consumer must therefore be able to
 * catch up from the database on (re)connect — which they can, because events
 * are pointers, not content (see topics.ts).
 */

import { EventEmitter } from 'node:events';
import { isRealtimeEvent, type RealtimeEvent } from './topics';

const REDIS_URL = () => process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = () => process.env.UPSTASH_REDIS_TOKEN;

/**
 * Whether events survive a hop between server instances.
 *
 * False means the in-process fallback is in use and a publish on one
 * instance is invisible on another. Callers surface this to the client so it
 * can decide whether it still needs a safety-net poll.
 */
export function isFanOutDurable(): boolean {
  return Boolean(REDIS_URL() && REDIS_TOKEN());
}

/* ── In-process fallback ─────────────────────────────────────────────── */

// A module-level emitter, so it survives across requests within one process.
// Next's dev server re-evaluates modules on edit; globalThis keeps the
// emitter identical across those reloads so a subscriber opened before an
// edit still hears a publish made after one.
const globalForBus = globalThis as typeof globalThis & {
  __aiDojoRealtimeBus?: EventEmitter;
};

function localBus(): EventEmitter {
  if (!globalForBus.__aiDojoRealtimeBus) {
    const emitter = new EventEmitter();
    // One listener per open SSE connection per topic. The default of 10 is a
    // leak warning threshold, not a limit, and a busy classroom exceeds it
    // legitimately.
    emitter.setMaxListeners(0);
    globalForBus.__aiDojoRealtimeBus = emitter;
  }
  return globalForBus.__aiDojoRealtimeBus;
}

/* ── Publish ─────────────────────────────────────────────────────────── */

/**
 * Announce an event on a topic. Fails open, like every other optional
 * dependency here: a publish that cannot be delivered logs and returns. The
 * write it describes has already been committed, and subscribers reconcile
 * from the database on their next catch-up.
 */
export async function publish(topic: string, event: RealtimeEvent): Promise<void> {
  const payload = JSON.stringify(event);

  if (!isFanOutDurable()) {
    localBus().emit(topic, event);
    return;
  }

  // Local subscribers are served directly as well: the Upstash round-trip is
  // an extra ~50ms for a subscriber that is already on this instance, and
  // Upstash does not echo a publish back to the publisher's own connection.
  localBus().emit(topic, event);

  try {
    const res = await fetch(`${REDIS_URL()}/publish/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN()}` },
      body: Buffer.from(payload, 'utf8').toString('base64'),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn('[realtime] publish failed', res.status, (await res.text()).slice(0, 200));
    }
  } catch (err) {
    console.warn('[realtime] publish error:', err instanceof Error ? err.message : String(err));
  }
}

/** Publishes the same event on several topics. */
export async function publishAll(topicList: string[], event: RealtimeEvent): Promise<void> {
  await Promise.all(topicList.map((t) => publish(t, event)));
}

/* ── Subscribe ───────────────────────────────────────────────────────── */

export interface Delivery {
  topic: string;
  event: RealtimeEvent;
}

/**
 * Yields events published on any of `topicList` until `signal` aborts.
 *
 * Both transports feed one queue so the caller — the SSE route — has a single
 * shape to forward regardless of which is live.
 */
export async function* subscribe(
  topicList: string[],
  signal: AbortSignal,
): AsyncGenerator<Delivery> {
  const queue: Delivery[] = [];
  let wake: (() => void) | null = null;

  const push = (delivery: Delivery) => {
    queue.push(delivery);
    wake?.();
  };

  // Local listeners are attached in both modes (see publish()).
  const listeners = topicList.map((topic) => {
    const handler = (event: RealtimeEvent) => push({ topic, event });
    localBus().on(topic, handler);
    return { topic, handler };
  });

  const remoteReader = isFanOutDurable() ? startUpstashReader(topicList, signal, push) : null;

  try {
    while (!signal.aborted) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        wake = null;
        if (signal.aborted) break;
      }
      while (queue.length > 0) {
        yield queue.shift()!;
      }
    }
  } finally {
    for (const { topic, handler } of listeners) localBus().off(topic, handler);
    await remoteReader?.catch(() => {});
  }
}

/**
 * Reads Upstash's SSE stream and pushes onto the shared queue.
 *
 * Runs detached from the generator's own loop: the generator must stay
 * responsive to `signal` even while this is blocked on a socket read.
 * Reconnects with backoff, because a dropped subscription is the one failure
 * here the client cannot see — its own EventSource stays open and simply
 * goes quiet.
 */
function startUpstashReader(
  topicList: string[],
  signal: AbortSignal,
  push: (d: Delivery) => void,
): Promise<void> {
  const channels = topicList.map(encodeURIComponent).join(',');

  return (async () => {
    let backoffMs = 500;

    while (!signal.aborted) {
      try {
        const res = await fetch(`${REDIS_URL()}/subscribe/${channels}`, {
          headers: {
            Authorization: `Bearer ${REDIS_TOKEN()}`,
            Accept: 'text/event-stream',
          },
          signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`subscribe HTTP ${res.status}`);
        }

        backoffMs = 500;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Frames are newline-delimited; a chunk can split one in half.
          let newline: number;
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            const delivery = parseUpstashFrame(line);
            if (delivery) push(delivery);
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        console.warn(
          '[realtime] subscribe dropped, retrying:',
          err instanceof Error ? err.message : String(err),
        );
      }

      if (signal.aborted) return;
      await sleep(backoffMs, signal);
      backoffMs = Math.min(backoffMs * 2, 10_000);
    }
  })();
}

/**
 * `data: message,{channel},{base64 payload}` → a delivery, or null.
 *
 * Exported for `bus.test.ts`. The framing is the one part of this transport
 * that is not in a type definition anywhere — it was read off the live
 * Upstash stream — so it is the part worth pinning down in a test.
 */
export function parseUpstashFrame(line: string): Delivery | null {
  if (!line.startsWith('data: ')) return null;
  const rest = line.slice('data: '.length);
  const parts = rest.split(',');
  // Upstash also emits `subscribe,{channel},{count}` on connect.
  if (parts.length < 3 || parts[0] !== 'message') return null;

  const topic = decodeURIComponent(parts[1]);
  // The payload is base64 and so contains no commas, but rejoining is free
  // insurance against a future encoding change.
  const encoded = parts.slice(2).join(',');

  try {
    const event: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!isRealtimeEvent(event)) return null;
    return { topic, event };
  } catch {
    return null;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
