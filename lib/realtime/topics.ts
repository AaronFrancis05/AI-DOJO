/**
 * Realtime topics and the events that travel on them.
 *
 * Kept free of server imports (no Drizzle, no Redis) because client
 * components need the topic builders and the event union — importing them
 * from `bus.ts` would drag the database client into the browser bundle, the
 * same reason `lib/auth/roles.ts` is split out of `lib/auth/server.ts`.
 *
 * ── The one rule for payloads ──────────────────────────────────────────
 * An event is a POINTER, never content. It says "room 12 has a new message"
 * and the client re-fetches through the normal authorized route; it never
 * carries the message body.
 *
 * Two reasons, both load-bearing:
 *  1. The pub/sub channel has no per-subscriber authorization. Anything put
 *     on a topic is readable by every subscriber of that topic, so content on
 *     the wire would move the access check out of the API route and into the
 *     fan-out, where it does not exist.
 *  2. Chat content is per-reader anyway — every member sees the message
 *     translated into *their* language (see lib/ugajapa.ts), so there is no
 *     single body to broadcast.
 */

export const topics = {
  /** New messages in one chat room. Subscribers must be room members. */
  chatRoom: (roomId: number) => `chat:${roomId}`,
  /** One user's own notifications. Subscribers must BE that user. */
  user: (userId: string) => `user:${userId}`,
  /** Queue movement in one assessment room. Tutor + queued learners. */
  assessment: (assessmentId: number) => `assessment:${assessmentId}`,
  /** Roster/status changes on one scheduled class. */
  classSession: (classId: number) => `class:${classId}`,
} as const;

export type RealtimeEvent =
  /** A message landed in a room. `messageId` lets the client skip a re-fetch it already has. */
  | { type: 'chat.message'; roomId: number; messageId: number; senderId: string | null }
  /** Someone in the room marked it read — drives the read receipts on the list pane. */
  | { type: 'chat.read'; roomId: number; userId: string }
  /** A notification row was written for this user. */
  | { type: 'notification'; notificationId: number }
  /** The assessment queue changed: someone joined, was admitted, or finished. */
  | { type: 'assessment.queue'; assessmentId: number }
  /** The assessment itself moved between scheduled/live/completed. */
  | { type: 'assessment.status'; assessmentId: number; status: string }
  /** A class session changed status or roster. */
  | { type: 'class.updated'; classId: number };

/** A rough guard for values arriving off the wire. */
export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
