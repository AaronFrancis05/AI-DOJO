import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { srsCards } from '@/src/schema';
import { eq, and } from 'drizzle-orm';

const MIN_EASE = 1.3;

function applySm2(card: { state: string; intervalDays: number; easeFactor: string; reviewCount: number; lapseCount: number }, quality: number) {
  let ease = Math.max(MIN_EASE, parseFloat(card.easeFactor) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  let state = card.state;
  let interval = card.intervalDays;
  let reviewCount = card.reviewCount;
  let lapseCount = card.lapseCount;

  if (quality >= 3) {
    if (state === 'relearning' || reviewCount === 0) {
      interval = 1;
      reviewCount = 1;
      state = 'learning';
    } else if (reviewCount === 1) {
      interval = 6;
      reviewCount = 2;
      state = 'review';
    } else {
      interval = Math.round(interval * ease);
      reviewCount += 1;
      state = 'review';
    }
  } else {
    interval = 1;
    reviewCount = 0;
    lapseCount += 1;
    state = 'relearning';
  }

  return { ease, interval, reviewCount, lapseCount, state };
}

export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { cardId?: number; quality?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const cardId = Number(body.cardId);
  const quality = Number(body.quality);
  if (!Number.isInteger(cardId) || !Number.isInteger(quality) || quality < 0 || quality > 5) {
    return Response.json({ error: 'cardId and quality (0-5) are required' }, { status: 400 });
  }

  const [card] = await db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.id, cardId), eq(srsCards.userId, authUser.id)));

  if (!card) {
    return Response.json({ error: 'Card not found' }, { status: 404 });
  }

  const result = applySm2(card, quality);
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + result.interval * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(srsCards)
    .set({
      state: result.state,
      intervalDays: result.interval,
      easeFactor: result.ease.toFixed(2),
      reviewCount: result.reviewCount,
      lapseCount: result.lapseCount,
      lastReviewedAt: now,
      nextReviewAt,
    })
    .where(eq(srsCards.id, card.id))
    .returning();

  return Response.json({
    success: true,
    card: updated,
    nextReviewAt,
  });
}
