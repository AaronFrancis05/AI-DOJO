import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { srsCards, vocabulary } from '@/src/schema';
import { and, eq, lte } from 'drizzle-orm';

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      card: srsCards,
      vocabulary: vocabulary,
    })
    .from(srsCards)
    .innerJoin(vocabulary, eq(srsCards.vocabularyId, vocabulary.id))
    .where(
      and(
        eq(srsCards.userId, authUser.id),
        lte(srsCards.nextReviewAt, new Date()),
      ),
    )
    .orderBy(srsCards.nextReviewAt);

  return Response.json({
    success: true,
    dueCount: rows.length,
    cards: rows.map(({ card, vocabulary: v }) => ({
      id: card.id,
      vocabularyId: v.id,
      targetText: v.targetText,
      phonetic: v.phonetic,
      translation: v.translation,
      category: v.category,
      usageTip: v.usageTip,
      state: card.state,
      intervalDays: card.intervalDays,
      easeFactor: card.easeFactor,
      reviewCount: card.reviewCount,
    })),
  });
}
