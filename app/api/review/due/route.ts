import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { srsCards, users, vocabulary } from '@/src/schema';
import { and, eq, lte } from 'drizzle-orm';
import { applyTargetLanguageVocab, getTargetVocabLocalizations } from '@/lib/localization';

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
      .select({ targetLanguage: users.preferredTargetLanguage })
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1),
  ]);

  // Base vocabulary rows hold the Japanese word, so every card used to show
  // Japanese whatever the learner studies. Cards carry no language of their
  // own, so the learner's current target language decides; the override is
  // the same one sessions apply (lib/localization.ts), looked up once per
  // scenario and cached there.
  const targetLanguage = profile?.targetLanguage ?? 'ja';
  const isBaseLanguage = targetLanguage === 'ja';
  const localizedVocab = new Map<number, typeof rows[number]['vocabulary']>();
  if (isBaseLanguage) {
    for (const { vocabulary: v } of rows) localizedVocab.set(v.id, v);
  } else {
    const byScenario = new Map<number, typeof rows[number]['vocabulary'][]>();
    for (const { vocabulary: v } of rows) {
      const list = byScenario.get(v.scenarioId) ?? [];
      list.push(v);
      byScenario.set(v.scenarioId, list);
    }
    await Promise.all([...byScenario].map(async ([scenarioId, vocabRows]) => {
      const locMap = await getTargetVocabLocalizations(scenarioId, targetLanguage);
      for (const v of applyTargetLanguageVocab(vocabRows, locMap)) localizedVocab.set(v.id, v);
    }));
  }

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
