import { createHash } from 'node:crypto';
import { StreamClient } from '@stream-io/node-sdk';
import {
  getStreamConfig,
  ROOM_TOKEN_TTL_SECONDS,
  JOIN_WINDOW_BEFORE_MS,
  JOIN_GRACE_AFTER_MS,
} from './config';

/**
 * A call id that is unguessable and stable for the life of a room.
 *
 * Generated when the booking/class/assessment is created and stored on the
 * row, so every participant resolves the same call without negotiating one.
 * Deliberately NOT derived from the row id: a sequential call id would let
 * anyone holding a valid token for their own room guess someone else's.
 */
export function generateCallId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `dojo-${suffix}`;
}

export interface BookingWindow {
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
}

export type JoinDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Whether a booking may be joined right now.
 *
 * Time-gating happens on the SERVER, before a token is minted — a token is
 * the only thing standing between a participant and the call, so the check
 * cannot live in the UI.
 *
 * Shared by all three room types. A class or an assessment has no
 * 'requested' state, so that branch simply never fires for them.
 */
export function canJoinBooking(booking: BookingWindow, now: Date = new Date()): JoinDecision {
  if (booking.status === 'cancelled') {
    return { allowed: false, reason: 'This booking was cancelled.' };
  }
  if (booking.status === 'requested') {
    return { allowed: false, reason: 'The tutor has not confirmed this booking yet.' };
  }
  // Both statuses outrank the clock, and deliberately so.
  //
  // 'completed' is the tutor saying the room is finished; the grace window
  // would otherwise keep letting people back into a session that is over.
  // 'live' is the tutor saying it has opened — a class started on the spot, or
  // early — and a time check that still answered "this has not opened yet"
  // would make going live mean nothing.
  if (booking.status === 'completed') {
    return { allowed: false, reason: 'This session has ended.' };
  }
  if (booking.status === 'live') {
    return { allowed: true };
  }

  const start = booking.scheduledAt.getTime();
  const end = start + booking.durationMinutes * 60 * 1000;
  const t = now.getTime();

  if (t < start - JOIN_WINDOW_BEFORE_MS) {
    return { allowed: false, reason: 'This session has not opened yet.' };
  }
  if (t > end + JOIN_GRACE_AFTER_MS) {
    return { allowed: false, reason: 'This session has ended.' };
  }

  return { allowed: true };
}

/**
 * The Stream user id for one of our users.
 *
 * Namespaced so a Stream identity can never collide with another app's, and
 * sanitized because Stream only accepts `[a-zA-Z0-9@_-]` in a user id while
 * `users.id` is free-form text from the auth provider.
 *
 * Sanitizing is lossy — `a.b` and `a-b` would collapse onto one identity, and
 * a collision here is impersonation, not a cosmetic clash. Ids that need
 * rewriting therefore carry a digest of the original, so distinct users stay
 * distinct. Ids that are already safe (the UUIDs Neon Auth issues) pass
 * through unchanged and stay readable in the Stream dashboard.
 */
export function streamUserId(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9@_-]/g, '-');
  if (safe === userId) return `user-${userId}`;
  const digest = createHash('sha256').update(userId).digest('hex').slice(0, 12);
  return `user-${safe}-${digest}`;
}

export interface CallTokenInput {
  callType: string;
  callId: string;
  userId: string;
  /** Tutors administer the room: mute-all, spotlight, end the call. */
  isTutor: boolean;
}

/**
 * Mints a Stream token scoped to exactly one call.
 *
 * A *call* token, not a plain user token: a user token would let its holder
 * join any call in the app whose id they could guess, which is the property
 * the unguessable `callId` above exists to avoid relying on. Scoping the
 * token to one `call_cid` makes the id's secrecy a second line of defence
 * rather than the only one.
 *
 * Callers MUST have already confirmed the requester belongs in that room;
 * this function does no authorization of its own.
 */
export function createCallToken(input: CallTokenInput): string | null {
  const config = getStreamConfig();
  if (!config) return null;

  const client = new StreamClient(config.apiKey, config.apiSecret);

  return client.generateCallToken({
    user_id: streamUserId(input.userId),
    // Only the tutor administers the room; a learner in their own lesson has
    // no reason to be able to remove the other participant.
    role: input.isTutor ? 'admin' : 'user',
    call_cids: [`${input.callType}:${input.callId}`],
    validity_in_seconds: ROOM_TOKEN_TTL_SECONDS,
  });
}
