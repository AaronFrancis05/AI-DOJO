import { db } from '@/src/db';
import { courses, lessons, lessonPhases, scenarios, vocabulary } from '@/src/schema';
import { asc, eq, and } from 'drizzle-orm';
import {
  getTargetScenarioLocalization,
  getTargetVocabLocalizations,
  applyScenarioLocalization,
  applyTargetLanguageVocab,
} from '@/lib/localization';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; lessonId: string }> },
) {
  const { slug, lessonId } = await params;
  const numericLessonId = Number(lessonId);
  if (isNaN(numericLessonId)) {
    return Response.json({ success: false, error: 'Invalid lessonId' }, { status: 400 });
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.slug, slug), eq(courses.isActive, true)));

  if (!course) {
    return Response.json({ success: false, error: 'Course not found' }, { status: 404 });
  }

  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, numericLessonId));

  if (!lesson) {
    return Response.json({ success: false, error: 'Lesson not found' }, { status: 404 });
  }

  const [phases, scenario, vocabRows] = await Promise.all([
    db
      .select()
      .from(lessonPhases)
      .where(eq(lessonPhases.lessonId, lesson.id))
      .orderBy(asc(lessonPhases.sequenceOrder)),
    lesson.scenarioId
      ? db.select().from(scenarios).where(eq(scenarios.id, lesson.scenarioId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    lesson.scenarioId
      ? db.select().from(vocabulary).where(eq(vocabulary.scenarioId, lesson.scenarioId)).orderBy(vocabulary.id)
      : Promise.resolve([]),
  ]);

  // Localize scenario + vocabulary into the course's target language so a
  // non-Japanese course (e.g. "Survival French for Uganda") drills the right
  // words and shows the right context instead of the Japanese base content.
  let localizedScenario = scenario;
  let localizedVocab = vocabRows;
  const targetLanguage = course.targetLanguage;
  if (scenario && targetLanguage) {
    const [scenarioLoc, vocabLoc] = await Promise.all([
      getTargetScenarioLocalization(scenario.id, targetLanguage),
      vocabRows.length > 0 ? getTargetVocabLocalizations(scenario.id, targetLanguage) : Promise.resolve(new Map()),
    ]);
    if (scenarioLoc) localizedScenario = applyScenarioLocalization(scenario, scenarioLoc);
    if (vocabLoc.size > 0) localizedVocab = applyTargetLanguageVocab(vocabRows, vocabLoc);
  }

  return Response.json({
    success: true,
    lesson: { ...lesson, phases, scenario: localizedScenario, vocabulary: localizedVocab },
  });
}
