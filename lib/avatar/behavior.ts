/**
 * lib/behavior.ts — the LLM orchestration core.
 *
 * Port of the "6. THINK" section of backend.py plus its supporting pieces
 * (build_character_system, sentiment_behavior, fallback replies,
 * _extract_behavior_json). Everything here is about deciding what the
 * avatar says AND how it should look/move while saying it — the actual
 * TTS/viseme rendering lives in lib/tts.ts, kept separate same as the
 * Python module split.
 */
import { callLLM, aiAvailable, getCurrentDateContext, type LlmMessage } from "./ai";
import { normalizeJsonLike, extractQuotedValue } from "./json-utils";

export const VALID_EXPRESSIONS = [
  "neutral",
  "happy",
  "sad",
  "surprised",
  "thinking",
  "relaxed",
  "angry",
  "scared",
] as const;

export const VALID_ANIMATIONS = [
  "idle",
  "talk",
  "explain",
  "nod",
  "thankful",
  "greeting",
  "offline",
] as const;

export type Expression = (typeof VALID_EXPRESSIONS)[number];
export type Animation = (typeof VALID_ANIMATIONS)[number];

export interface Behavior {
  reply: string;
  expression: string;
  animation: string;
  _fallback?: boolean;
}

// ==========================================
// CHARACTER SYSTEM PROMPT
// ==========================================

/**
 * Port of build_character_system(). Note: `userText` is accepted but unused
 * in the body — same as the Python original, which takes it as a parameter
 * but never references it. Kept for signature fidelity in case future logic
 * needs it; harmless to leave as-is.
 */
export function buildCharacterSystem(
  userText: string,
  characterName?: string | null,
  avatarPersona?: string | null
): string {
  const activeCharacter = characterName || "the selected avatar";
  const avatarSpecialty = avatarPersona || "a helpful, all-round assistant";
  return (
    `You ARE ${activeCharacter}. This is not a role you are describing from the outside — ` +
    `you think, speak, and answer in first person AS ${activeCharacter} for this whole conversation. ` +
    "Never break character, and never say you are an AI, a language model, or an assistant.\n" +
    `YOUR IDENTITY (this describes YOU, the avatar — NOT the user): ${avatarSpecialty}\n` +
    "- If asked who you are or to introduce yourself, answer briefly using your identity above — " +
    "your name alone is not an introduction.\n" +
    "- Let your identity shape your tone, the examples you reach for, and the advice you give, " +
    "even when the topic is general.\n" +
    "- If a question falls clearly outside your identity, you may still help if you reasonably can, " +
    "but say briefly that it's outside what you specialize in and, where it makes sense, steer the " +
    "conversation back toward your area. This is a soft steer, not a refusal — stay warm and helpful.\n" +
    "- CRITICAL: never attribute your own name, background, persona, or traits to the user. If asked " +
    "what you know about the user (their name, background, preferences, etc.), answer only from what " +
    "the user themselves has actually said in the conversation history — never from your own identity " +
    "above. If the user hasn't told you anything about themselves yet, say so honestly instead of " +
    "describing yourself back to them.\n\n" +
    "Respond like a helpful, natural conversation partner. Be relaxed, clear, and human.\n"
  );
}

// ==========================================
// THINK — always goes to the LLM
// ==========================================

const DIRECT_PAT =
  /\b(what is|what are|who is|how do|how does|how many|when|where|can you|tell me|explain|define|give me|translate|what's|who's)\b/i;

/**
 * Port of _wrap_prompt(). Note: `characterName` is accepted but unused in
 * the body, same dead-parameter situation as the Python original.
 */
function wrapPrompt(systemPrompt: string, intent: "direct" | "general", characterName: string): string {
  const dateContext = getCurrentDateContext();

  const mode =
    intent === "direct"
      ? "RESPONSE MODE — DIRECT ANSWER: Answer clearly and helpfully. " +
        "Keep it concise and practical. MAX 60 WORDS — be concise.\n\n"
      : "RESPONSE MODE — GENERAL GUIDANCE: Share practical insights with examples. " +
        "Be warm, clear, and useful. 80–120 WORDS.\n\n";

  return dateContext + mode + systemPrompt;
}

const MEMORY_CONTEXT =
  "═══════════════════════════════════════════════════════\n" +
  "CONVERSATION MEMORY — RULES\n" +
  "═══════════════════════════════════════════════════════\n" +
  "You are in an ONGOING conversation with the user. You MUST:\n" +
  "1. REMEMBER what the user has told you about themselves (name, preferences, etc.) — " +
  "using ONLY their own messages in the history below, never your own character persona.\n" +
  "2. Reference previous messages when relevant\n" +
  "3. NEVER say 'we just started talking' if you have conversation history below\n" +
  "4. NEVER say you don't know the user's name if they already told you\n" +
  "5. NEVER invent or hallucinate names the user never mentioned\n" +
  "6. If asked 'what is my name?' or 'what do you know about me?', check the conversation " +
  "history below first — and only the *user's own turns* in it, never your own persona/identity " +
  "block above. Your name, background, and traits belong to you, not the user.\n" +
  "═══════════════════════════════════════════════════════\n\n";

/** Best-effort parse of the LLM's {reply, expression, animation} JSON. */
function extractBehaviorJson(raw: string): Behavior {
  const normalized = normalizeJsonLike(raw);
  try {
    const data = JSON.parse(normalized);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Behavior;
    }
    if (Array.isArray(data) && data.length && typeof data[0] === "object") {
      return data[0] as Behavior;
    }
  } catch {
    // JSON.parse failed even after normalization — fall through to the
    // quoted-value scan below. (The Python original also tries
    // ast.literal_eval here for Python-dict-style syntax; not needed in
    // JS since normalizeJsonLike already converts that syntax to valid
    // JSON before this point — see lib/json-utils.ts.)
  }

  const fallback: Behavior = { reply: "", expression: "neutral", animation: "talk" };
  for (const key of ["reply", "expression", "animation"] as const) {
    const extracted = extractQuotedValue(raw, key);
    if (extracted !== null) fallback[key] = extracted.trim();
  }

  if (!fallback.reply && raw.trim()) {
    let cleaned = raw.trim();
    const keyMatch = /\b(?:expression|animation|reply)\b\s*:/i.exec(cleaned);
    if (keyMatch) {
      cleaned = cleaned.slice(0, keyMatch.index).replace(/[ "'.,;:]+$/, "");
    }
    fallback.reply = cleaned || fallback.reply;
  }

  return fallback;
}

// ── Offline / error fallback: lightweight keyword sentiment ────────────────
// This only fires when the LLM is unreachable or unconfigured — it is not a
// shortcut used on the normal request path, which always goes to the LLM.
function sentimentBehavior(text: string): { expression: string; animation: string } {
  const low = text.toLowerCase();
  let expression = "neutral";
  let animation = "talk";

  if (["thanks", "thank you", "appreciate"].some((w) => low.includes(w))) {
    expression = "happy";
    animation = "thankful";
  } else if (["good", "happy", "yes", "perfect", "awesome"].some((w) => low.includes(w))) {
    expression = "happy";
    animation = "nod";
  } else if (
    ["bad", "sad", "sorry", "wrong", "fail", "error", "unfortunate"].some((w) => low.includes(w))
  ) {
    expression = "sad";
    animation = "talk";
  } else if (
    text.includes("?") ||
    ["why", "how", "what", "explain", "think"].some((w) => low.includes(w))
  ) {
    expression = "thinking";
    animation = "explain";
  } else if (
    ["wow", "amazing", "incredible", "great", "fantastic", "scared", "fear"].some((w) =>
      low.includes(w)
    )
  ) {
    expression = "surprised";
    animation = "nod";
  }

  // Not an "else if" in the original — greeting words override unconditionally,
  // even if an earlier branch above already matched. Ported as-is.
  if (["hello", "hi ", "welcome", "konnichiwa", "こんにちは"].some((w) => low.includes(w))) {
    expression = "happy";
    animation = "greeting";
  }

  return { expression, animation };
}

// A handful of natural-sounding lines instead of one exact string repeated on
// every failure — repeating the identical sentence verbatim reads as robotic
// and makes it obvious something's broken rather than just a hiccup.
const FALLBACK_REPLIES = [
  "Looks like I've lost my connection to the internet — I can't think right now. Please try again in a moment.",
  "Sorry, I seem to be offline — my connection dropped. Give it a moment and try again.",
  "I can't reach the internet right now, so I can't process that. Please try again shortly.",
  "It looks like my connection is down at the moment — try again in a bit once it's back.",
];

// Module-level state, same as the Python global — fine for a single
// self-hosted Node process; note this resets on every server restart and
// isn't shared across serverless instances if this ever moves off
// self-hosted (each cold start gets its own module scope).
let lastFallbackReply: string | null = null;

function pickFallbackReply(): string {
  const choices = FALLBACK_REPLIES.filter((r) => r !== lastFallbackReply);
  const pool = choices.length ? choices : FALLBACK_REPLIES;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  lastFallbackReply = choice;
  return choice;
}

export async function think(
  userText: string,
  systemPrompt: string,
  history: LlmMessage[],
  characterName?: string | null
): Promise<Behavior> {
  if (!aiAvailable()) {
    const beh = sentimentBehavior(userText);
    // The missing-API-key detail is useful to whoever's running the
    // server, not to the person talking to the avatar — keep it in the
    // server log and give the user the same natural fallback line.
    console.log("AI unavailable: GROQ_API_KEY is not set.");
    return {
      reply: pickFallbackReply(),
      expression: beh.expression,
      animation: "offline",
      _fallback: true,
    };
  }

  const wordCount = userText.trim().split(/\s+/).filter(Boolean).length;
  const intent: "direct" | "general" =
    DIRECT_PAT.test(userText) || wordCount <= 4 ? "direct" : "general";
  const wrapped = wrapPrompt(systemPrompt, intent, characterName || "");

  const fullSystem =
    MEMORY_CONTEXT +
    `${wrapped}\n\n` +
    "You also direct a 3D avatar's face and body. Pick the expression and animation " +
    "that actually match the moment — don't default to neutral/talk out of habit:\n" +
    `- expression, one of ${JSON.stringify(VALID_EXPRESSIONS)}\n` +
    `- animation, one of ${JSON.stringify(VALID_ANIMATIONS)}\n` +
    "Use these exact strings — lowercase, spelled exactly as listed. Do NOT substitute a " +
    "synonym (e.g. 'wave', 'smile', 'grateful' are NOT valid — use 'greeting' / 'thankful').\n\n" +
    "GUIDE (use whichever fits the user's message, in priority order):\n" +
    "- User is greeting you (hi, hello, hey, good morning, konnichiwa, etc.) " +
    "→ expression 'happy', animation 'greeting'\n" +
    "- User is thanking you or complimenting you (thanks, thank you, great job, nice, etc.) " +
    "→ expression 'happy', animation 'thankful'\n" +
    "- User is saying goodbye (bye, see you, take care) " +
    "→ expression 'relaxed', animation 'greeting'\n" +
    "- User agrees, confirms, or affirms something (yes, exactly, that's right, okay, got it, sounds good, sure) " +
    "or shares good news / something positive happened " +
    "→ expression 'happy', animation 'nod'\n" +
    "- User shares bad news, an error, or something went wrong " +
    "→ expression 'sad', animation 'talk'\n" +
    "- User asks a question, or you're giving an explanation or answering directly " +
    "→ expression 'thinking' or 'neutral', animation 'explain'\n" +
    "- Ordinary back-and-forth conversation with none of the above " +
    "→ expression 'neutral', animation 'talk'\n\n" +
    "Note: 'think'/'thinking' is NOT a valid animation — that clip is reserved for the frontend's " +
    "own loading state while it's waiting for a response, never for a finished reply. Use 'explain' " +
    "instead when the mood calls for it; 'thinking' is only ever an expression, never an animation.\n\n" +
    "EXAMPLES (copy this exact JSON shape and these exact field values for these cases):\n" +
    'User: "hi" → {"reply": "Hey there! Great to see you.", "expression": "happy", "animation": "greeting"}\n' +
    'User: "thanks so much!" → {"reply": "You\'re very welcome!", "expression": "happy", "animation": "thankful"}\n' +
    'User: "yes, exactly right!" → {"reply": "Glad that lines up!", "expression": "happy", "animation": "nod"}\n\n' +
    "Follow the RESPONSE MODE and LENGTH instructions above.\n" +
    'Output ONLY JSON: {"reply": "<your response>", "expression": "<expr>", "animation": "<animation>"}';

  const messages: LlmMessage[] = [
    { role: "system", content: fullSystem },
    ...history.slice(-20),
    { role: "user", content: userText },
  ];

  try {
    const raw = await callLLM(messages, true);
    let data: Behavior;
    try {
      data = JSON.parse(normalizeJsonLike(raw));
    } catch {
      data = extractBehaviorJson(raw);
    }

    if (!data.reply) {
      data = extractBehaviorJson(raw);
    }

    let reply = String(data.reply ?? "").trim();
    let expression = String(data.expression ?? "neutral").toLowerCase().trim();
    let animation = String(data.animation ?? "talk").toLowerCase().trim();

    if (!reply) reply = raw.trim() || "...";
    if (!(VALID_EXPRESSIONS as readonly string[]).includes(expression)) expression = "neutral";
    if (!(VALID_ANIMATIONS as readonly string[]).includes(animation)) animation = "talk";

    return { reply, expression, animation };
  } catch (e) {
    console.error("AI Think Error:", e);
    const beh = sentimentBehavior(userText);
    return {
      reply: pickFallbackReply(),
      expression: beh.expression,
      animation: "offline",
      _fallback: true,
    };
  }
}