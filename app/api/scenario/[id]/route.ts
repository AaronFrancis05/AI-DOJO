import { db } from '../../../../src/db';
import { scenarios, vocabulary, scenarioGoals, scenarioLocalizations, vocabularyLocalizations } from '../../../../src/schema';
import { eq, asc, and, inArray } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numericId = Number(id);
    const lang = new URL(req.url).searchParams.get('lang') ?? 'en';

    if (!id || isNaN(numericId)) {
      return Response.json({ success: false, error: 'Invalid or missing Scenario ID' }, { status: 400 });
    }

    const [scenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, numericId));

    if (!scenario) {
      return Response.json({ success: false, error: 'Scenario not found' }, { status: 404 });
    }

    let localized = scenario;
    if (lang && lang !== 'en') {
      const [loc] = await db
        .select()
        .from(scenarioLocalizations)
        .where(and(
          eq(scenarioLocalizations.scenarioId, numericId),
          eq(scenarioLocalizations.languageCode, lang),
        ))
        .limit(1);
      if (loc) {
        localized = {
          ...scenario,
          title: loc.title ?? scenario.title,
          context: loc.context ?? scenario.context,
          learningGoals: loc.learningGoals ?? scenario.learningGoals,
          aiCharacterName: loc.aiCharacterName ?? scenario.aiCharacterName,
          aiCharacterRole: loc.aiCharacterRole ?? scenario.aiCharacterRole,
          userCharacterName: loc.userCharacterName ?? scenario.userCharacterName,
          userCharacterRole: loc.userCharacterRole ?? scenario.userCharacterRole,
        };
      }
    }

    const vocabItems = await db
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.scenarioId, numericId));

    let localizedVocab = vocabItems;
    if (lang && lang !== 'en' && vocabItems.length > 0) {
      const vocabLocRows = await db
        .select({
          vocabularyId: vocabularyLocalizations.vocabularyId,
          translation: vocabularyLocalizations.translation,
          usageTip: vocabularyLocalizations.usageTip,
        })
        .from(vocabularyLocalizations)
        .where(and(
          eq(vocabularyLocalizations.languageCode, lang),
          inArray(vocabularyLocalizations.vocabularyId, vocabItems.map(v => v.id)),
        ));
      const locByVocab = new Map(vocabLocRows.map(r => [r.vocabularyId, r]));
      localizedVocab = vocabItems.map(v => {
        const loc = locByVocab.get(v.id);
        if (!loc) return v;
        return {
          ...v,
          translation: loc.translation ?? v.translation,
          usageTip: loc.usageTip ?? v.usageTip,
        };
      });
    }

    const goals = await db
      .select()
      .from(scenarioGoals)
      .where(eq(scenarioGoals.scenarioId, numericId))
      .orderBy(asc(scenarioGoals.sequenceOrder));

    return Response.json({
      success: true,
      scenario: {
        ...localized,
        vocabulary: localizedVocab,
        goals,
      }
    });
  } catch (error) {
    console.error("Failed fetching scenario:", error);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
