/**
 * Configuration for the live tutoring feature.
 *
 * The feature is built against a SELF-HOSTED LiveKit server (see
 * docker-compose.livekit.yml), not LiveKit Cloud. Until that server is
 * deployed, `TUTORS_ENABLED` is false and every tutor surface stays hidden —
 * the code ships dark rather than showing a booking flow that cannot connect.
 */

/**
 * Client-visible flag. Must be referenced as a full literal
 * `process.env.NEXT_PUBLIC_TUTORS_ENABLED` for Next.js to inline it into the
 * browser bundle.
 */
export const TUTORS_ENABLED = process.env.NEXT_PUBLIC_TUTORS_ENABLED === '1';

/** Server-side LiveKit credentials. Never send these to the client. */
export interface LiveKitServerConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads the LiveKit server config, or returns null when it isn't configured.
 *
 * Returning null rather than throwing keeps a missing deployment a
 * 503-with-explanation instead of an unhandled crash on any route that
 * happens to import this.
 */
export function getLiveKitConfig(): LiveKitServerConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/** How long a room access token stays valid. */
export const ROOM_TOKEN_TTL_SECONDS = 60 * 60 * 2;

/**
 * How early a participant may join before the scheduled time, and how long
 * after it the room stays joinable. Generous on both sides — a tutor arriving
 * early to set up, or a lesson running over, shouldn't be locked out.
 */
export const JOIN_WINDOW_BEFORE_MS = 15 * 60 * 1000;
export const JOIN_GRACE_AFTER_MS = 30 * 60 * 1000;

export const BOOKING_DURATIONS_MINUTES = [30, 45, 60] as const;
