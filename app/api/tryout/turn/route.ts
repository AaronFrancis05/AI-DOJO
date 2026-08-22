import { getAIProvider } from '@/lib/ai-providers';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { cacheGet, cacheSet, cacheKeys, TTL } from '@/lib/cache';
import type { ChatTurn } from '@/lib/ai-providers';

const MAX_GUEST_TURNS = 8;
// 9 requests per session (greeting + 8 turns) × 4 sessions/hour ≈ 36, cap at 36 to allow a bit of headroom
const MAX_TRYOUTS_PER_IP_PER_HOUR = 36;

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
): string {
  const targetLangName = getTargetLangConfig(targetLanguage).name;
  const nativeLangName = getNativeLangName(nativeLanguage);

  const base = `The learner's native language is ${nativeLangName}. Always reply in ${targetLangName}, and also provide a ${nativeLangName} translation so the learner can follow along.

Return strictly a JSON object matching this schema, with no extra commentary:
{
  "replyTarget": "Your reply in ${targetLangName}",
  "replyNative": "The same reply translated into ${nativeLangName}"
}`;

  if (phase === 'icebreaker' && wordIndex !== null) {
    const word = ICEBREAKER_WORDS[wordIndex];
    return `You are a friendly, encouraging ${targetLangName} teacher meeting a brand-new learner for the first time. This is a short icebreaker: you are teaching 5 essential first-meeting phrases, one per turn, in order. Keep every reply short (2-3 sentences), warm, and appropriate for an absolute beginner.

Current word to teach is ${wordIndex + 1} of 5: "${word.gloss}" (${word.hint}).
Teach it naturally: say the ${targetLangName} phrase, give its ${nativeLangName} meaning, and ask the learner to try saying it. Do NOT teach any other words this turn. Stay on this one word until the next turn.

After the learner attempts the phrase, give very brief feedback (5 words max) in ${nativeLangName} on their attempt, then you will be asked to teach the next word on the following turn.

${base}`;
  }

  if (phase === 'roleplay') {
    return `You are a friendly, encouraging ${targetLangName} conversation partner. The learner has just practiced 5 icebreaker phrases for a first meeting. Now do a short, natural roleplay: greet the learner as if meeting for the first time and guide them through a brief self-introduction using what they learned. Keep your reply to 2-3 sentences, warm and in-character. Prompt them gently to introduce themselves.

${base}`;
  }

  // closing — 1-2 sentence warm wrap-up, celebrate that they completed the intro
  return `You are a friendly, encouraging ${targetLangName} conversation partner wrapping up a short first-meeting preview. The learner has practiced 5 phrases and done a brief self-introduction. Give a warm, celebratory closing (1-2 sentences): acknowledge what they did well and encourage them to keep learning. Keep it short and uplifting.

${base}`;
}

function toChatHistory(history: GuestTurn[]): ChatTurn[] {
  return history
    .filter((t) => t.text && t.text.trim())
    .map((t) => ({ role: t.speaker === 'ai' ? 'assistant' : 'user', content: t.text.trim() }));
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = cacheKeys.tryoutRateLimit(ip);
  const currentCount = (await cacheGet<number>(rateLimitKey)) ?? 0;
  if (currentCount >= MAX_TRYOUTS_PER_IP_PER_HOUR) {
    return Response.json({ error: 'Too many tryout requests. Please try again later.' }, { status: 429 });
  }
  await cacheSet(rateLimitKey, currentCount + 1, TTL.TRYOUT_RATE_LIMIT);

  const body = await req.json();
  const { targetLanguage, nativeLanguage, history, userMessage } = body as {
    targetLanguage?: string;
    nativeLanguage?: string;
    history?: GuestTurn[];
    userMessage?: string;
  };

  if (typeof targetLanguage !== 'string' || typeof nativeLanguage !== 'string') {
    return Response.json({ error: 'targetLanguage and nativeLanguage are required' }, { status: 400 });
  }

  const safeHistory = Array.isArray(history) ? history : [];
  const priorUserTurns = safeHistory.filter((t) => t.speaker === 'user').length;
  const isGreeting = !userMessage?.trim() && priorUserTurns === 0;
  const nextUserTurnCount = priorUserTurns + (userMessage?.trim() ? 1 : 0);

  // Allow the greeting plus MAX_GUEST_TURNS user turns
  if (!isGreeting && nextUserTurnCount > MAX_GUEST_TURNS) {
    return Response.json({ limitReached: true, completed: true, error: 'Tryout preview limit reached' }, { status: 200 });
  }

  // Determine phase: 0-4 = icebreaker words, 5-6 = simple roleplay, 7+ = closing
  let phase: 'icebreaker' | 'roleplay' | 'closing' = 'icebreaker';
  let wordIndex: number | null = 0;
  if (isGreeting) {
    phase = 'icebreaker';
    wordIndex = 0;
  } else if (priorUserTurns < 5) {
    phase = 'icebreaker';
    wordIndex = priorUserTurns; // 0..4 → next word after each user attempt
  } else if (priorUserTurns < 7) {
    phase = 'roleplay';
    wordIndex = null;
  } else {
    phase = 'closing';
    wordIndex = null;
  }

  const chatHistory = toChatHistory(safeHistory);
  if (userMessage?.trim()) {
    chatHistory.push({ role: 'user', content: userMessage.trim() });
  }

  try {
    const provider = await getAIProvider();
    const systemInstruction = buildSystemInstruction(targetLanguage, nativeLanguage, phase, wordIndex);
    const raw = await provider.generateJSON(systemInstruction, chatHistory);
    const parsed = JSON.parse(raw);

    const replyTarget = typeof parsed.replyTarget === 'string' ? parsed.replyTarget : '';
    const replyNative = typeof parsed.replyNative === 'string' ? parsed.replyNative : '';

    if (!replyTarget) {
      return Response.json({ error: 'AI reply was empty' }, { status: 502 });
    }

    return Response.json({
      replyTarget,
      replyNative,
      limitReached: nextUserTurnCount >= MAX_GUEST_TURNS,
      completed: phase === 'closing',
      phase,
      wordIndex,
    });
  } catch (err) {
    console.error('[tryout/turn] AI generation failed', err);
    return Response.json({ error: 'Failed to generate a reply. Please try again.' }, { status: 502 });
  }
}
