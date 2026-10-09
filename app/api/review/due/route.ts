import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { srsCards, studyPackItems, studyPacks, users, vocabulary } from '@/src/schema';
import { and, eq, lte } from 'drizzle-orm';
import { localizeVocabularyForLearner } from '@/lib/localization';
import { BASE_CONTENT_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '@/lib/language';
import { parseCardPayload } from '@/lib/study-packs/cards';

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [profile] = await db
    .select({ targetLanguage: users.preferredTargetLanguage, nativeLanguage: users.nativeLanguage })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);
  const targetLanguage = profile?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  const nativeLanguage = profile?.nativeLanguage ?? 'en';
  const now = new Date();

  const [rows, packRows] = await Promise.all([
    db
      .select({
        card: srsCards,
        vocabulary: vocabulary,
      })
      .from(srsCards)
      .innerJoin(vocabulary, eq(srsCards.vocabularyId, vocabulary.id))
      .where(
        and(
          eq(srsCards.userId, authUser.id),
          lte(srsCards.nextReviewAt, now),
        ),
      )
      .orderBy(srsCards.nextReviewAt),
    // Study-pack cards carry their own text, written for one language pair,
    // so only the pack's target language is due — switching languages does
    // not mix another language's sentences into the queue.
    db
      .select({ card: srsCards })
      .from(srsCards)
      .innerJoin(studyPackItems, eq(srsCards.studyPackItemId, studyPackItems.id))
      .innerJoin(studyPacks, eq(studyPackItems.packId, studyPacks.id))
      .where(
        and(
          eq(srsCards.userId, authUser.id),
          lte(srsCards.nextReviewAt, now),
          eq(studyPacks.targetLanguage, targetLanguage),
        ),
      )
      .orderBy(srsCards.nextReviewAt),
  ]);

  // Vocab cards carry no language of their own, so the learner's current
  // target language decides the word and their native language decides the
  // meaning and tip — the same resolver sessions use (lib/localization.ts),
  // looked up once per scenario and cached there.
  const isBaseLanguage = targetLanguage === BASE_CONTENT_LANGUAGE;
  const localizedVocab = new Map<number, typeof rows[number]['vocabulary']>();
  const byScenario = new Map<number, typeof rows[number]['vocabulary'][]>();
  for (const { vocabulary: v } of rows) {
    const list = byScenario.get(v.scenarioId) ?? [];
    list.push(v);
    byScenario.set(v.scenarioId, list);
  }
  await Promise.all([...byScenario].map(async ([scenarioId, vocabRows]) => {
    const localized = await localizeVocabularyForLearner(scenarioId, vocabRows, targetLanguage, nativeLanguage);
    for (const v of localized) localizedVocab.set(v.id, v);
  }));

  const schedule = (card: typeof srsCards.$inferSelect) => ({
    id: card.id,
    state: card.state,
    intervalDays: card.intervalDays,
    easeFactor: card.easeFactor,
    reviewCount: card.reviewCount,
    nextReviewAt: card.nextReviewAt,
  });

  const vocabCards = rows.map(({ card, vocabulary: base }) => {
    const v = localizedVocab.get(base.id) ?? base;
    return {
      ...schedule(card),
      cardType: 'vocab' as const,
      vocabularyId: v.id,
      // The front is the word in the target language; the back its meaning.
      front: v.targetText,
      frontIsTarget: true,
      back: v.translation,
      backIsTarget: false,
      // The phonetic column stores Japanese romaji only; shown for any other
      // language it would be the romaji of a word the learner never sees.
      phonetic: isBaseLanguage ? v.phonetic : null,
      category: v.category,
      note: v.usageTip,
      example: null as string | null,
    };
  });

  const packCards = packRows.flatMap(({ card }) => {
    const payload = parseCardPayload(card.payload);
    if (!payload) return [];
    return [{
      ...schedule(card),
      cardType: card.cardType === 'grammar' ? 'grammar' as const : 'sentence' as const,
      vocabularyId: null,
      ...payload,
      phonetic: null as string | null,
      category: null as string | null,
    }];
  });

  const cards = [...vocabCards, ...packCards]
    .sort((a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime());

  return Response.json({
    success: true,
    dueCount: cards.length,
    cards,
  });
}
