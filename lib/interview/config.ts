/**
 * Configuration for the AI examiner.
 *
 * An assessment room can be run by its tutor over the Stream call, or — when
 * the tutor cannot be there — by a Gemini Live examiner that speaks to each
 * learner privately. This module configures the second case.
 *
 * ── The documented exception to AGENTS.md §5 ──────────────────────────
 * "AI provider calls always go through `lib/ai-providers/`" holds everywhere
 * in this codebase except the Live socket, and it cannot hold here: that
 * interface is `generateJSON` / `generateStream` over text, and a Live
 * session is a bidirectional *audio* WebSocket the browser holds open. There
 * is no text completion to route through the circuit breaker, and no
 * meaningful failover — Azure, Anthropic and Groq have no equivalent surface
 * behind this contract.
 *
 * So the split is drawn explicitly and narrowly:
 *   - Minting the ephemeral token (`token.ts`) talks to `@google/genai`
 *     directly. That is the exception, and it is the whole of it.
 *   - GRADING the finished interview (`grade.ts`) goes through
 *     `lib/ai-providers/` like every other scoring call in the app, so a
 *     Gemini outage still lets a completed interview be marked.
 *
 * Gated by `TUTORS_ENABLED` like every other tutoring surface, and by
 * `getInterviewConfig()` returning null (→ 503) when the key is absent,
 * exactly as `getStreamConfig()` does for video. No second feature flag.
 */

export interface InterviewServerConfig {
  apiKey: string;
  model: string;
}

/**
 * The Live model the examiner speaks with.
 *
 * Verified against this project's key on 2026-08-26 via `ai.models.list()`
 * filtered to `bidiGenerateContent`. `gemini-2.5-flash-native-audio-latest`
 * is the tested fallback if this one is withdrawn; note that the id in the
 * original `webrtc.txt` sketch (`gemini-2.5-flash-live-preview`) is NOT
 * served to this key.
 */
export const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

/**
 * Ephemeral tokens are a v1alpha-only, Gemini-Developer-API-only feature.
 * Both the mint and the browser's connect must pin this version.
 */
export const GEMINI_LIVE_API_VERSION = 'v1alpha';

/**
 * How long the learner has to *start* the interview after asking for a token,
 * and how long the resulting session may then run.
 *
 * Two separate clocks on purpose: a short window to open the socket means a
 * token scraped out of a network log is stale almost immediately, while the
 * session it opened is still allowed to run its full length.
 */
export const TOKEN_START_WINDOW_MS = 2 * 60 * 1000;

/** Slack added to the interview budget before the token itself expires. */
export const TOKEN_OVERRUN_GRACE_MS = 10 * 60 * 1000;

/**
 * Bounds on a client-reported transcript. It arrives from the browser, so it
 * is sized before it is stored — see transcript.ts.
 */
export const MAX_TRANSCRIPT_TURNS = 400;
export const MAX_TRANSCRIPT_TEXT_CHARS = 4_000;
export const MAX_TRANSCRIPT_TOTAL_CHARS = 60_000;

/** Below this many learner turns there is nothing to grade honestly. */
export const MIN_GRADABLE_LEARNER_TURNS = 2;

/**
 * Reads the Gemini key, or returns null when it isn't configured.
 *
 * Null rather than a throw, matching `getStreamConfig()`: an unconfigured
 * deployment answers 503 with an explanation instead of crashing every route
 * that imports this.
 */
export function getInterviewConfig(): InterviewServerConfig | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL,
  };
}
