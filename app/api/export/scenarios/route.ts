import { db } from '../../../../src/db';
import { scenarios, vocabulary, scenarioGoals } from '../../../../src/schema';
import { verifyExportApiKey } from '../../../../lib/exportAuth';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: Request) {
  if (!verifyExportApiKey(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const list = await db
    .select()
    .from(scenarios)
    .orderBy(asc(scenarios.displayOrder));

  const result = await Promise.all(list.map(async (scenario) => {
    const vocabItems = await db
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.scenarioId, scenario.id));

    const goalsList = await db
      .select({
        sequenceOrder: scenarioGoals.sequenceOrder,
        goalText: scenarioGoals.goalText,
        goalType: scenarioGoals.goalType,
        targetPhraseJp: scenarioGoals.targetPhraseJp,
      })
      .from(scenarioGoals)
      .where(eq(scenarioGoals.scenarioId, scenario.id))
      .orderBy(asc(scenarioGoals.sequenceOrder));

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      context: scenario.context,
      businessType: scenario.businessType,
      difficulty: scenario.difficulty,
      domain: scenario.domain,
      aiCharacterName: scenario.aiCharacterName,
      aiCharacterRole: scenario.aiCharacterRole,
      userCharacterRole: scenario.userCharacterRole,
      learningGoals: scenario.learningGoals,
      goals: goalsList,
      vocabulary: vocabItems,
    };
  }));

  return Response.json({ success: true, scenarios: result });
}
