/* ───────────────────────────────────────────────
   The single realtime connection.

   One SSE stream per browser tab, carrying every topic that tab cares about:
   its open chat room, its notifications, the assessment queue it is waiting
   in. Multiplexed on purpose — a connection per feature would burn the
   browser's per-origin connection budget on a page that shows a classroom,
   its chat and the bell at the same time.

   Replaces the 3-second poll in the messaging UI. See lib/realtime/bus.ts
   for the transport and lib/realtime/topics.ts for why events carry no
   content.
   ─────────────────────────────────────────────── */

import { getAuthUser } from '@/lib/auth/server';
import { authorizeTopics } from '@/lib/realtime/authorize';
import { isFanOutDurable, subscribe } from '@/lib/realtime/bus';

export const runtime = 'nodejs';
// A long-lived stream must never be prerendered or cached.
export const dynamic = 'force-dynamic';
// Vercel caps a Node function's wall clock; the client's EventSource
// reconnects when the server closes, so a cap is a reconnect interval, not a
// failure. 300s is the highest the Pro plan allows.
export const maxDuration = 300;

/** Cap on topics per connection — a client asking for hundreds is a bug. */
const MAX_TOPICS = 24;

/** Comment frames keep intermediaries from timing the connection out. */
const HEARTBEAT_MS = 25_000;

/**
 * How long before `maxDuration` the server closes on its own terms.
 *
 * Being killed mid-frame leaves the client's EventSource to notice a broken
 * socket; closing deliberately lets it reconnect on the normal path and run
 * its catch-up fetch.
 */
const SOFT_CLOSE_MS = (maxDuration - 15) * 1000;

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const requested = (url.searchParams.get('topics') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TOPICS);

  if (requested.length === 0) {
    return Response.json({ error: 'At least one topic is required' }, { status: 400 });
  }

  const allowed = await authorizeTopics(requested, user.id);

  const encoder = new TextEncoder();
  const controller = new AbortController();
  // The client aborting (tab closed, navigation) must tear the Redis
  // subscription down with it, or an instance accumulates one upstream
  // connection per visit.
  req.signal.addEventListener('abort', () => controller.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (event: string, data: unknown) => {
        try {
          ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The consumer went away between the abort and this write.
          controller.abort();
        }
      };

      // The client needs two things up front: which of its topics actually
      // took (a stale room id silently dropping would look like a dead
      // feature), and whether the fan-out crosses instances — when it does
      // not, the client keeps a slow reconciliation poll alive.
      send('ready', {
        topics: allowed,
        rejected: requested.filter((t) => !allowed.includes(t)),
        durable: isFanOutDurable(),
      });

      const heartbeat = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          controller.abort();
        }
      }, HEARTBEAT_MS);

      const softClose = setTimeout(() => controller.abort(), SOFT_CLOSE_MS);

      try {
        if (allowed.length > 0) {
          for await (const { topic, event } of subscribe(allowed, controller.signal)) {
            send('message', { topic, event });
          }
        } else {
          // Nothing to listen to, but the connection is still held open so
          // the heartbeat and the soft close behave identically either way.
          await new Promise<void>((resolve) => {
            controller.signal.addEventListener('abort', () => resolve(), { once: true });
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('[realtime] stream failed:', err instanceof Error ? err.message : String(err));
        }
      } finally {
        clearInterval(heartbeat);
        clearTimeout(softClose);
        try {
          ctrl.close();
        } catch {
          // Already closed by the consumer.
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      // Same reasoning as the roleplay stream: an intermediary that buffers
      // frames turns a live event into a late one.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
