import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { srsCards, users, vocabulary } from '@/src/schema';
import { and, eq, lte } from 'drizzle-orm';
import { localizeVocabularyForLearner } from '@/lib/localization';
import { BASE_CONTENT_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '@/lib/language';

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [rows, [profile]] = await Promise.all([
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
          lte(srsCards.nextReviewAt, new Date()),
        ),
      )
      .orderBy(srsCards.nextReviewAt),
    db
      .select({ targetLanguage: users.preferredTargetLanguage, nativeLanguage: users.nativeLanguage })
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1),
  ]);

  // Cards carry no language of their own, so the learner's current target
  // language decides the word and their native language decides the meaning
  // and tip — the same resolver sessions use (lib/localization.ts), looked up
  // once per scenario and cached there.
  const targetLanguage = profile?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  const nativeLanguage = profile?.nativeLanguage ?? 'en';
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

  return Response.json({
    success: true,
    dueCount: rows.length,
    cards: rows.map(({ card, vocabulary: base }) => {
      const v = localizedVocab.get(base.id) ?? base;
      return {
        id: card.id,
        vocabularyId: v.id,
        targetText: v.targetText,
        // The phonetic column stores Japanese romaji only; shown for any other
        // language it would be the romaji of a word the learner never sees.
        phonetic: isBaseLanguage ? v.phonetic : null,
        translation: v.translation,
        category: v.category,
        usageTip: v.usageTip,
        state: card.state,
        intervalDays: card.intervalDays,
        easeFactor: card.easeFactor,
        reviewCount: card.reviewCount,
      };
    }),
  });
}
