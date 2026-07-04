import { db } from '../../../../src/db';
import { scenarios, vocabulary, scenarioGoals } from '../../../../src/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numericId = Number(id);

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

    const vocabItems = await db
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.scenarioId, numericId));

    const goals = await db
      .select()
      .from(scenarioGoals)
      .where(eq(scenarioGoals.scenarioId, numericId))
      .orderBy(asc(scenarioGoals.sequenceOrder));

    return Response.json({
      success: true,
      scenario: {
        ...scenario,
        vocabulary: vocabItems,
        goals,
      }
    });
  } catch (error) {
    console.error("Failed fetching scenario:", error);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
