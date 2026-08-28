/**
 * Configuration for the live tutoring feature.
 *
 * Video runs on GetStream Cloud Video. Deliberately Video ONLY: GetStream
 * Chat is a separate, far more expensive contract, and every text surface in
 * this product — including the sidebar inside a live room — is served by the
 * project's own `chat_rooms` tables with UgaJapa translation. Nothing here
 * may import a Stream chat client.
 *
 * `TUTORS_ENABLED` gates every surface, and `getStreamConfig()` returns null
 * rather than throwing when credentials are missing, so an unconfigured
 * deployment answers 503 instead of crashing any route that imports this.
 */

/**
 * Client-visible flags. Must be referenced as full literals
 * (`process.env.NEXT_PUBLIC_*`) for Next.js to inline them into the browser
 * bundle — a destructured `process.env` read is not substituted.
 */
export const TUTORS_ENABLED = process.env.NEXT_PUBLIC_TUTORS_ENABLED === '1';

/**
 * The Stream API key is public by design — it identifies the app, and a
 * token is what grants access. The secret never leaves the server.
 */
export const STREAM_API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY ?? '';

/** Server-side Stream credentials. Never send the secret to the client. */
export interface StreamServerConfig {
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads the Stream credentials, or returns null when they aren't configured.
 *
 * Returning null rather than throwing keeps a missing deployment a
 * 503-with-explanation instead of an unhandled crash.
 */
export function getStreamConfig(): StreamServerConfig | null {
  // The server may carry its own copy of the key; falling back to the public
  // one means a deployment only has to set the secret to go live.
  const apiKey = process.env.STREAM_API_KEY || STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;

  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

/**
 * The Stream call type every room is created on.
 *
 * `default` grants a ring-less, permission-checked call — the tutor joins as
 * `admin` (mute others, end the call) and learners as `user`. Stored on each
 * row as well, so moving future rooms to a custom type needs no migration of
 * the existing ones.
 */
export const DEFAULT_CALL_TYPE = 'default';

/** How long a call access token stays valid. */
export const ROOM_TOKEN_TTL_SECONDS = 60 * 60 * 2;

/**
 * How early a participant may join before the scheduled time, and how long
 * after it the room stays joinable. Generous on both sides — a tutor arriving
 * early to set up, or a lesson running over, shouldn't be locked out.
 */
export const JOIN_WINDOW_BEFORE_MS = 15 * 60 * 1000;
export const JOIN_GRACE_AFTER_MS = 30 * 60 * 1000;

export const BOOKING_DURATIONS_MINUTES = [30, 45, 60] as const;

/** Durations a tutor may schedule a group class or an assessment for. */
export const CLASS_DURATIONS_MINUTES = [30, 45, 60, 90] as const;

/** Upper bound on learners in one class room. */
export const MAX_CLASS_CAPACITY = 50;
