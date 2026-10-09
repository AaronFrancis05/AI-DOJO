import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/server';
import { getAIProvider } from '@/lib/ai-providers';
import type { ChatTurn } from '@/lib/ai-providers';
import { cacheKeys, rateLimitIncrement, rateLimitUnavailable, TTL } from '@/lib/cache';
import { boundGuestHistory, clientIp, countGuestUserTurns, MAX_GUEST_TURN_CHARS } from '@/lib/tryout/gate';
import { sanitizeLanguageCode } from '@/lib/tryout/guest-params';
import {
  MAX_ONBOARDING_REQUESTS_PER_HOUR,
  buildPracticeSystemInstruction,
  consumePracticeTurn,
  practicePhase,
  resetPracticeTurns,
  resolvePracticeSituation,
} from '@/lib/onboarding/practice';

export const runtime = 'nodejs';

interface PracticeTurn {
  speaker: 'user' | 'ai';
  text: string;
}

function toChatHistory(history: PracticeTurn[]): ChatTurn[] {
  return history
    .filter((t) => t.text && t.text.trim())
    .map((t) => ({ role: t.speaker === 'ai' ? 'assistant' : 'user', content: t.text.trim() }));
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  const ip = clientIp(req);
  const budgetId = user?.id ?? `guest:${ip}`;
  const rateId = user?.id ?? ip;

  const requests = await rateLimitIncrement(
    cacheKeys.onboardingPracticeRateLimit(rateId),
    TTL.ONBOARDING_PRACTICE,
  );
  if (rateLimitUnavailable(requests)) {
    return NextResponse.json({ error: 'Practice is briefly unavailable. Please try again.' }, { status: 503 });
  }
  if (requests !== null && requests > MAX_ONBOARDING_REQUESTS_PER_HOUR) {
    return NextResponse.json({ error: 'Too many practice requests. Please try again later.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    domainId,
    level,
    targetLanguage,
    nativeLanguage,
    history,
    userMessage,
    restart,
  } = body as {
    domainId?: number;
    level?: string;
    targetLanguage?: string;
    nativeLanguage?: string;
    history?: PracticeTurn[];
    userMessage?: string;
    restart?: boolean;
  };

  if (typeof domainId !== 'number' || !Number.isFinite(domainId) || domainId <= 0) {
    return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
  }
  const target = sanitizeLanguageCode(targetLanguage);
  const native = sanitizeLanguageCode(nativeLanguage);
  if (!target || !native) {
    return NextResponse.json({ error: 'targetLanguage and nativeLanguage are required' }, { status: 400 });
  }

  const resolved = await resolvePracticeSituation(domainId, typeof level === 'string' && level ? level : 'beginner', target);
  if (!resolved) {
    return NextResponse.json({ error: 'No situation in this domain' }, { status: 404 });
  }
  const { situation, phrases } = resolved;

  if (restart) {
    await resetPracticeTurns(budgetId);
  }

  const safeHistory = boundGuestHistory(history);
  if (typeof userMessage === 'string' && userMessage.length > MAX_GUEST_TURN_CHARS) {
    return NextResponse.json({ error: 'That message is too long.' }, { status: 413 });
  }
  const isGreeting = !userMessage?.trim();
  const historyUserTurns = countGuestUserTurns(safeHistory);
  const budget = await consumePracticeTurn(budgetId, !isGreeting, historyUserTurns);

  if (budget.exhausted) {
    return NextResponse.json({ limitReached: true, completed: true });
  }

  const { priorUserTurns } = budget;
  const nextUserTurnCount = priorUserTurns + (isGreeting ? 0 : 1);
  const phaseInfo = practicePhase(priorUserTurns, isGreeting, phrases.length);

  const chatHistory = toChatHistory(safeHistory);
  if (userMessage?.trim()) {
    chatHistory.push({ role: 'user', content: userMessage.trim() });
  }

  try {
    const provider = await getAIProvider();
    const systemInstruction = buildPracticeSystemInstruction({
      targetLanguage: target,
      nativeLanguage: native,
      situation,
      phrases,
      phase: phaseInfo.phase,
      wordIndex: phaseInfo.wordIndex,
      nextWordIndex: phaseInfo.nextWordIndex,
      isGreeting,
    });
    const raw = await provider.generateJSON(systemInstruction, chatHistory);
    const parsed = JSON.parse(raw);
    const replyTarget = typeof parsed.replyTarget === 'string' ? parsed.replyTarget : '';
    const replyNative = typeof parsed.replyNative === 'string' ? parsed.replyNative : '';

    if (!replyTarget) {
      return NextResponse.json({ error: 'AI reply was empty' }, { status: 502 });
    }

    const limitReached = nextUserTurnCount >= phrases.length;
    const completed = phaseInfo.phase === 'closing' || limitReached;

    return NextResponse.json({
      replyTarget,
      replyNative,
      limitReached,
      completed,
      phase: phaseInfo.phase,
      situation: {
        title: situation.title,
        characterName: situation.characterName,
        characterRole: situation.characterRole,
      },
    });
  } catch (err) {
    console.error('[onboarding/turn] AI generation failed', err);
    return NextResponse.json({ error: 'Failed to generate a reply. Please try again.' }, { status: 502 });
  }
}
