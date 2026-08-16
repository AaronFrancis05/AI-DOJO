/**
 * lib/ai.ts — LLM connectivity for the avatar backend.
 *
 * Port of ai.py. Owns exactly two things, same as the Python original:
 *   1. The Groq client (OpenAI-compatible) and a single callLLM() entry
 *      point used by both the /ask route (character replies) and
 *      lib/translation.ts (EN<->JA translation).
 *   2. A date/time context builder so the LLM always knows "today".
 *
 * Everything else the character actually says or does (personas, TTS/
 * visemes, response validation) belongs in lib/behavior.ts, not here —
 * same separation of concerns as the Python backend.py / ai.py split.
 */
import OpenAI, { toFile } from "openai";

// ==========================================
// LLM CONFIG & CLIENT (Groq, via the OpenAI-compatible API)
// ==========================================

/**
 * The OpenAI SDK just appends '/chat/completions' to baseURL, so baseURL
 * MUST be Groq's *API* host ('api.groq.com', not the marketing site
 * 'groq.com') and end in '/openai/v1', or every request 405s. This
 * tolerates whatever ends up in .env — bare host, the marketing domain,
 * trailing slash, already-correct value, etc — and always resolves to the
 * one URL shape that actually works. Same normalization as ai.py's
 * _normalize_groq_base_url().
 */
function normalizeGroqBaseUrl(raw: string | undefined): string {
  let url = (raw ?? "").trim().replace(/\/+$/, "");
  if (!url) return "https://api.groq.com/openai/v1";

  // Common mix-up: the marketing site (groq.com) instead of the API host
  // (api.groq.com) — same domain minus the 'api.' subdomain.
  url = url.replace(/:\/\/(?:www\.)?groq\.com/, "://api.groq.com");

  if (url.endsWith("/openai/v1") || url.endsWith("/chat/completions")) {
    return url;
  }
  return `${url}/openai/v1`;
}

const GROQ_API_KEY = (process.env.GROQ_API_KEY ?? "").trim();
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const GROQ_BASE_URL = normalizeGroqBaseUrl(
  process.env.GROQ_BASE_URL ?? "https://api.groq.com"
);

// Groq's Whisper endpoint — same account/key as the chat model above, just a
// different model name against the OpenAI-compatible /audio/transcriptions
// route. "turbo" is faster and cheap; swap via env if you want the
// highest-accuracy (slightly slower) whisper-large-v3 variant instead.
const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo";

let llmClient: OpenAI | null = null;
try {
  llmClient = GROQ_API_KEY
    ? new OpenAI({ apiKey: GROQ_API_KEY, baseURL: GROQ_BASE_URL })
    : null;
} catch (e) {
  console.warn(`⚠️ LLM client init failed: ${e}`);
  llmClient = null;
}

export function aiAvailable(): boolean {
  return llmClient !== null;
}

/**
 * Speech-to-text via Groq's hosted Whisper (same client/key as callLLM).
 * `filename` just needs a plausible extension — Groq uses it to sniff the
 * container format (webm/mp4/wav/etc), it isn't saved anywhere.
 * `language` is an optional ISO-639-1 hint ("en"/"ja"); Whisper auto-detects
 * when omitted, but passing it in when you already know it (e.g. from the
 * UI's response-language toggle) measurably improves accuracy and latency.
 */
export async function transcribeAudio(
  audioBytes: Buffer,
  filename: string = "audio.webm",
  language?: string | null
): Promise<string> {
  if (!llmClient) {
    throw new Error("No GROQ_API_KEY set in environment");
  }

  const file = await toFile(audioBytes, filename);
  const result = await llmClient.audio.transcriptions.create({
    model: GROQ_STT_MODEL,
    file,
    ...(language ? { language } : {}),
  });

  const text = (result as { text?: string }).text;
  return (text ?? String(result)).trim();
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Call the LLM (Groq) and return the raw text response, fences stripped. */
export async function callLLM(
  messages: LlmMessage[],
  jsonMode: boolean = false
): Promise<string> {
  if (!llmClient) {
    throw new Error("No GROQ_API_KEY set in environment");
  }

  const response = await llmClient.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return raw.trim().replace(/```json/g, "").replace(/```/g, "").trim();
}

// ==========================================
// DATE / TIME CONTEXT
// ==========================================

function formatInZone(date: Date, timeZone: string | undefined) {
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
  return { dateStr: dateFmt.format(date), timeStr: timeFmt.format(date) };
}

/**
 * Build a short block that grounds the LLM in the current real-world date,
 * optionally localized to the user's timezone. Port of ai.py's
 * _get_current_date_context().
 */
export function getCurrentDateContext(userTimezone?: string | null): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let timeZone: string | undefined;
  let tzName: string;

  if (userTimezone) {
    try {
      // Validate the zone by attempting to format with it — Intl throws a
      // RangeError on an unknown zone, mirroring pytz.UnknownTimeZoneError.
      new Intl.DateTimeFormat("en-US", { timeZone: userTimezone });
      timeZone = userTimezone;
      tzName = userTimezone;
    } catch {
      timeZone = undefined;
      tzName = "Server local time";
    }
  } else {
    timeZone = undefined;
    tzName = "Server local time";
  }

  const today = formatInZone(now, timeZone);
  const yest = formatInZone(yesterday, timeZone);
  const tom = formatInZone(tomorrow, timeZone);

  return (
    "═══════════════════════════════════════════════════════\n" +
    "TEMPORAL CONTEXT\n" +
    "═══════════════════════════════════════════════════════\n" +
    `Today is ${today.dateStr}, current time ${today.timeStr} (${tzName}).\n` +
    `Yesterday was ${yest.dateStr}; tomorrow is ${tom.dateStr}.\n` +
    "Your training data has a cutoff, but you always know the real current date shown above — " +
    "never say 'as of 2023/2024' or claim not to know today's date.\n" +
    "═══════════════════════════════════════════════════════\n\n"
  );
}