import { AccessToken } from 'livekit-server-sdk';
import {
  getLiveKitConfig,
  ROOM_TOKEN_TTL_SECONDS,
  JOIN_WINDOW_BEFORE_MS,
  JOIN_GRACE_AFTER_MS,
} from './config';

/**
 * A room name that is unguessable and stable for the life of a booking.
 *
 * Generated at booking time and stored on the row so both participants
 * resolve the same room without negotiating one. Deliberately NOT derived
 * from the booking id alone: a sequential room name would let anyone with a
 * valid token for their own booking guess someone else's room.
 */
export function generateRoomName(): string {
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
 * the only thing standing between a participant and the room, so the check
 * cannot live in the UI.
 */
export function canJoinBooking(booking: BookingWindow, now: Date = new Date()): JoinDecision {
  if (booking.status === 'cancelled') {
    return { allowed: false, reason: 'This booking was cancelled.' };
  }
  if (booking.status === 'requested') {
    return { allowed: false, reason: 'The tutor has not confirmed this booking yet.' };
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

export interface RoomTokenInput {
  roomName: string;
  identity: string;
  displayName: string;
  /** Tutors may manage the room (e.g. mute a noisy participant). */
  isTutor: boolean;
}

/**
 * Mints a LiveKit access token scoped to exactly one room.
 *
 * Callers MUST have already confirmed the requester is a participant in that
 * booking; this function does no authorization of its own.
 */
export async function createRoomToken(input: RoomTokenInput): Promise<string | null> {
  const config = getLiveKitConfig();
  if (!config) return null;

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: input.identity,
    name: input.displayName,
    ttl: ROOM_TOKEN_TTL_SECONDS,
  });

  token.addGrant({
    room: input.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Only the tutor can administer the room; a learner joining their own
    // lesson has no reason to be able to remove the other participant.
    roomAdmin: input.isTutor,
  });

  return token.toJwt();
}
