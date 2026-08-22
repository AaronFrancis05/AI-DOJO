import { getAIProvider } from '@/lib/ai-providers';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { cacheGet, cacheSet, cacheKeys, TTL } from '@/lib/cache';
import type { ChatTurn } from '@/lib/ai-providers';

const MAX_GUEST_TURNS = 5;
const MAX_TRYOUTS_PER_IP_PER_HOUR = 5;

interface GuestTurn {
  speaker: 'user' | 'ai';
  text: string;
}

function buildSystemInstruction(targetLanguage: string, nativeLanguage: string): string {
  const targetLangName = getTargetLangConfig(targetLanguage).name;
  const nativeLangName = getNativeLangName(nativeLanguage);

  return `You are a friendly, encouraging ${targetLangName} conversation partner meeting a brand-new learner for the first time. This is a short introductory roleplay: greet the learner, introduce yourself briefly, and ask simple getting-to-know-you questions (name, how they're doing, why they want to learn ${targetLangName}). Keep every reply short (1-2 sentences), warm, and appropriate for an absolute beginner.

The learner's native language is ${nativeLangName}. Always reply in ${targetLangName}, and also provide a ${nativeLangName} translation so the learner can follow along.

Return strictly a JSON object matching this schema, with no extra commentary:
{
  "replyTarget": "Your reply in ${targetLangName}",
  "replyNative": "The same reply translated into ${nativeLangName}"
}`;
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
  const userTurnCount = safeHistory.filter((t) => t.speaker === 'user').length + (userMessage?.trim() ? 1 : 0);
  if (userTurnCount > MAX_GUEST_TURNS) {
    return Response.json({ limitReached: true, error: 'Tryout preview limit reached' }, { status: 200 });
  }

  const chatHistory = toChatHistory(safeHistory);
  if (userMessage?.trim()) {
    chatHistory.push({ role: 'user', content: userMessage.trim() });
  }

  try {
    const provider = await getAIProvider();
    const systemInstruction = buildSystemInstruction(targetLanguage, nativeLanguage);
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
      limitReached: userTurnCount >= MAX_GUEST_TURNS,
    });
  } catch (err) {
    console.error('[tryout/turn] AI generation failed', err);
    return Response.json({ error: 'Failed to generate a reply. Please try again.' }, { status: 502 });
  }
}
