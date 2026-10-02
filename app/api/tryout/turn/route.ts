import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAIProvider } from '@/lib/ai-providers';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { cacheKeys, isCacheConfigured, rateLimitIncrement, TTL } from '@/lib/cache';
import {
  MAX_GUEST_TURNS,
  MAX_TRYOUT_REQUESTS_PER_IP_PER_HOUR,
  TRYOUT_COOKIE,
  TRYOUT_SESSION_COOKIE,
  checkTryoutGate,
  clientIp,
  consumeTurn,
  countGuestUserTurns,
  guestTryoutPhase,
  markTryoutCompleted,
  readSessionCookieValue,
} from '@/lib/tryout/gate';
import { TRYOUT_CHARACTER_NAME } from '@/lib/tryout/character';
import type { ChatTurn } from '@/lib/ai-providers';

export const runtime = 'nodejs';

// Hardcoded 5 icebreaker words for the first-time introduction — the same set
// for every target language; the LLM translates them per language in its reply.
// These mirror src/seed.ts Scenario 1 (First Meeting) but as complete, natural
// example sentences (no "___" templates).
const ICEBREAKER_WORDS: Array<{ gloss: string; hint: string }> = [
  { gloss: 'Nice to meet you', hint: 'first-meeting greeting' },
  { gloss: 'My name is Alex', hint: 'self-introduction with your name' },
  { gloss: 'What is your name?', hint: 'asking the other person\'s name' },
  { gloss: 'I am from Uganda', hint: 'stating where you are from' },
  { gloss: 'I look forward to knowing you', hint: 'warm closing after introduction' },
];

interface GuestTurn {
  speaker: 'user' | 'ai';
  text: string;
}

function buildSystemInstruction(
  targetLanguage: string,
  nativeLanguage: string,
  phase: 'icebreaker' | 'roleplay' | 'closing',
  wordIndex: number | null,
  opts: { isGreeting: boolean; nextWordIndex: number | null },
): string {
  const targetLangName = getTargetLangConfig(targetLanguage).name;
  const nativeLangName = getNativeLangName(nativeLanguage);
  const sameLanguage = targetLanguage === nativeLanguage;

  const base = `The learner's native language is ${nativeLangName}. Always reply in ${targetLangName}.${
    sameLanguage
      ? ` Target and native are the same language — set replyNative to an empty string; do not repeat the reply.`
      : ` Also provide a ${nativeLangName} translation so the learner can follow along.`
  }

Return strictly a JSON object matching this schema, with no extra commentary:
{
  "replyTarget": "Your reply in ${targetLangName}",
  "replyNative": "${sameLanguage ? '' : `The same reply translated into ${nativeLangName}`}"
}`;

  if (phase === 'icebreaker' && wordIndex !== null) {
    const word = ICEBREAKER_WORDS[wordIndex];
    const lead = `You are ${TRYOUT_CHARACTER_NAME}, a friendly, encouraging ${targetLangName} teacher meeting a brand-new learner for the first time. Always introduce and refer to yourself as ${TRYOUT_CHARACTER_NAME} — never invent another name (Tanaka, Hana, or a local equivalent). This is a short icebreaker: you are teaching 5 essential first-meeting phrases, in order. Keep every reply short (2-4 sentences), warm, and appropriate for an absolute beginner.

The learner cannot take a turn until you ask them to. Never end a reply on feedback alone.`;

    if (opts.isGreeting) {
      return `${lead}

Teach phrase 1 of 5: "${word.gloss}" (${word.hint}).
Say the ${targetLangName} phrase, give its ${nativeLangName} meaning, and ask the learner to try saying it. Do not teach any other phrase yet.

${base}`;
    }

    const next = opts.nextWordIndex !== null ? ICEBREAKER_WORDS[opts.nextWordIndex] : null;
    if (next && opts.nextWordIndex !== null) {
      return `${lead}

The learner just attempted phrase ${wordIndex + 1} of 5: "${word.gloss}".
Give a very brief bit of feedback on their attempt (one short clause — do not ask them to retry).
Then immediately teach phrase ${opts.nextWordIndex + 1} of 5: "${next.gloss}" (${next.hint}).
Say the ${targetLangName} phrase, give its ${nativeLangName} meaning, and ask them to try saying it.

${base}`;
    }

    return `${lead}

The learner just attempted the last phrase (5 of 5): "${word.gloss}".
Give a very brief bit of feedback on their attempt (one short clause — do not ask them to retry).
Then immediately start a short first-meeting roleplay: greet them as ${TRYOUT_CHARACTER_NAME} meeting them for the first time and prompt them to introduce themselves using the phrases they practiced (name, where they are from).

${base}`;
  }

  if (phase === 'roleplay') {
    return `You are ${TRYOUT_CHARACTER_NAME}, a friendly, encouraging ${targetLangName} conversation partner in a short first-meeting roleplay. Stay ${TRYOUT_CHARACTER_NAME} — do not switch to another name. The learner has just practiced 5 icebreaker phrases. Continue the introduction already in progress — do not restart it from scratch. Keep your reply to 2-3 sentences, warm and in-character. If they stall, ask a short question (their name, where they are from). They cannot speak until you ask.

${base}`;
  }

  return `You are ${TRYOUT_CHARACTER_NAME}, a friendly, encouraging ${targetLangName} conversation partner wrapping up a short first-meeting preview. Stay ${TRYOUT_CHARACTER_NAME}. The learner has practiced 5 phrases and done a brief self-introduction. Give a warm, celebratory closing (1-2 sentences): acknowledge what they did well and encourage them to keep learning. Keep it short and uplifting.

${base}`;
}

function toChatHistory(history: GuestTurn[]): ChatTurn[] {
  return history
    .filter((t) => t.text && t.text.trim())
    .map((t) => ({ role: t.speaker === 'ai' ? 'assistant' : 'user', content: t.text.trim() }));
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Atomic — the previous cacheGet→cacheSet pair read the same count on every
  // concurrent request and so let a burst straight through. lib/cache.ts
  // documents that pattern as explicitly not being a rate limit.
  const requests = await rateLimitIncrement(cacheKeys.tryoutRateLimit(ip), TTL.TRYOUT_RATE_LIMIT);
  if (requests === null && isCacheConfigured()) {
    // A configured cache that is down is an outage, not a licence to hand out
    // an unmetered LLM relay to anonymous callers.
    return NextResponse.json({ error: 'Tryout is briefly unavailable. Please try again.' }, { status: 503 });
  }
  if (requests !== null && requests > MAX_TRYOUT_REQUESTS_PER_IP_PER_HOUR) {
    return NextResponse.json({ error: 'Too many tryout requests. Please try again later.' }, { status: 429 });
  }

  const body = await req.json();
  const { targetLanguage, nativeLanguage, history, userMessage } = body as {
    targetLanguage?: string;
    nativeLanguage?: string;
    history?: GuestTurn[];
    userMessage?: string;
  };

  if (typeof targetLanguage !== 'string' || typeof nativeLanguage !== 'string') {
    return NextResponse.json({ error: 'targetLanguage and nativeLanguage are required' }, { status: 400 });
  }

  const cookieStore = await cookies();

  // Read from the signed httpOnly cookie, never the body: the id *is* the
  // budget, so a caller who can name it can hand itself a fresh allowance.
  // `restart: true` sends the client back through /api/tryout/start, which is
  // gated — it is not a free reset.
  const tryoutId = readSessionCookieValue(cookieStore.get(TRYOUT_SESSION_COOKIE)?.value);
  if (!tryoutId) {
    return NextResponse.json({ error: 'This preview has expired.', restart: true }, { status: 400 });
  }

  const gate = await checkTryoutGate(cookieStore.get(TRYOUT_COOKIE)?.value, ip);
  if (gate.blocked) {
    return NextResponse.json(
      { blocked: true, reason: gate.reason, retryAfterMs: gate.retryAfterMs },
      { status: 200 },
    );
  }

  const safeHistory = Array.isArray(history) ? history : [];
  const isGreeting = !userMessage?.trim();
  const historyUserTurns = countGuestUserTurns(safeHistory);

  // Redis is the budget when it is configured. Without it (local dev), phase
  // and the turn cap follow historyUserTurns so the icebreaker can advance.
  const budget = await consumeTurn(tryoutId, !isGreeting, historyUserTurns);
  if (budget.expired) {
    return NextResponse.json({ error: 'This preview has expired.', restart: true }, { status: 400 });
  }
  const { priorUserTurns } = budget;
  const nextUserTurnCount = priorUserTurns + (isGreeting ? 0 : 1);

  if (budget.exhausted) {
    // No `error` key: the budget running out is the preview ending, and the
    // client renders the completion screen off `limitReached`. Sending an
    // error alongside made the hook throw before it ever read the flag.
    const res = NextResponse.json({ limitReached: true, completed: true });
    await markTryoutCompleted(res, ip);
    return res;
  }

  const { phase, wordIndex, nextWordIndex } = guestTryoutPhase(priorUserTurns, isGreeting);

  const chatHistory = toChatHistory(safeHistory);
  if (userMessage?.trim()) {
    chatHistory.push({ role: 'user', content: userMessage.trim() });
  }

  try {
    const provider = await getAIProvider();
    const systemInstruction = buildSystemInstruction(
      targetLanguage,
      nativeLanguage,
      phase,
      wordIndex,
      { isGreeting, nextWordIndex },
    );
    const raw = await provider.generateJSON(systemInstruction, chatHistory);
    const parsed = JSON.parse(raw);

    const replyTarget = typeof parsed.replyTarget === 'string' ? parsed.replyTarget : '';
    const replyNative = typeof parsed.replyNative === 'string' ? parsed.replyNative : '';

    if (!replyTarget) {
      return NextResponse.json({ error: 'AI reply was empty' }, { status: 502 });
    }

    const limitReached = nextUserTurnCount >= MAX_GUEST_TURNS;
    const completed = phase === 'closing';

    const res = NextResponse.json({
      replyTarget,
      replyNative,
      limitReached,
      completed,
      phase,
      wordIndex,
    });

    // The gate consumes on *completion*, not on entry — a guest whose network
    // dropped two turns in has not had their preview.
    if (completed || limitReached) {
      await markTryoutCompleted(res, ip);
    }
    return res;
  } catch (err) {
    console.error('[tryout/turn] AI generation failed', err);
    return NextResponse.json({ error: 'Failed to generate a reply. Please try again.' }, { status: 502 });
  }
}
