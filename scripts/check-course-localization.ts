/* ─────────────────────────────────────────────────────────────
   Regression check: confirm course content is actually localized.

   For every active course whose target language is not Japanese (the
   base vocabulary script), loads the first lesson's scenario +
   vocabulary and runs the same localization merge the API uses. Flags
   any course whose drilled vocabulary (or scenario context) still
   contains Japanese script — a sign the localization rows are missing
   for that language.

   Usage: npm run db:check-localization
   ───────────────────────────────────────────────────────────── */
import { db } from '../src/db';
import {
  courses,
  courseLevels,
  units,
  lessons,
  scenarios,
  vocabulary,
  scenarioLocalizations,
  vocabularyLocalizations,
} from '../src/schema';
import { eq, and } from 'drizzle-orm';
import { applyScenarioLocalization, applyTargetLanguageVocab } from '../lib/localization';

const JAPANESE_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]/;

// Loads target-language localizations straight from the DB (bypassing the
// Upstash cache) so the check asserts ground truth, not cached state.
async function loadTargetLocalizations(scenarioId: number, lang: string) {
  const [scenarioLoc] = await db
    .select()
    .from(scenarioLocalizations)
    .where(and(
      eq(scenarioLocalizations.scenarioId, scenarioId),
      eq(scenarioLocalizations.languageCode, lang),
    ))
    .limit(1);

  const vocabLocRows = await db
    .select({
      vocabularyId: vocabularyLocalizations.vocabularyId,
      translation: vocabularyLocalizations.translation,
      usageTip: vocabularyLocalizations.usageTip,
    })
    .from(vocabularyLocalizations)
    .innerJoin(vocabulary, eq(vocabularyLocalizations.vocabularyId, vocabulary.id))
    .where(and(
      eq(vocabularyLocalizations.languageCode, lang),
      eq(vocabulary.scenarioId, scenarioId),
    ));

  const vocabLoc = new Map(vocabLocRows.map((r) => [r.vocabularyId, { translation: r.translation, usageTip: r.usageTip }]));
  return { scenarioLoc: scenarioLoc ?? null, vocabLoc };
}

async function main(): Promise<void> {
  console.log('=== Course Localization Check ===\n');

  const courseRows = await db.select().from(courses).where(eq(courses.isActive, true));

  let failures = 0;
  let checked = 0;

  for (const course of courseRows) {
    if (course.targetLanguage === 'ja') continue; // base vocabulary is Japanese — nothing to localize

    const [firstLesson] = await db
      .select({ id: lessons.id, scenarioId: lessons.scenarioId })
      .from(lessons)
      .innerJoin(units, eq(lessons.unitId, units.id))
      .innerJoin(courseLevels, eq(units.levelId, courseLevels.id))
      .where(and(eq(courseLevels.courseId, course.id), eq(lessons.isActive, true)))
      .orderBy(courseLevels.sequenceOrder, lessons.sequenceOrder)
      .limit(1);

    if (!firstLesson?.scenarioId) {
      console.log(`  [skip] ${course.slug}: no scenario-linked lesson`);
      continue;
    }

    checked++;

    const [scenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, firstLesson.scenarioId));
    const vocabRows = await db
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.scenarioId, firstLesson.scenarioId))
      .orderBy(vocabulary.id);

    let localizedScenario = scenario;
    let localizedVocab = vocabRows;
    const targetLang = course.targetLanguage;
    if (scenario && targetLang) {
      const { scenarioLoc, vocabLoc } = await loadTargetLocalizations(scenario.id, targetLang);
      if (scenarioLoc) localizedScenario = applyScenarioLocalization(scenario, scenarioLoc);
      if (vocabLoc.size > 0) localizedVocab = applyTargetLanguageVocab(vocabRows, vocabLoc);
    }

    const japaneseVocab = localizedVocab.filter((v) => JAPANESE_SCRIPT.test(v.targetText));
    const japaneseContext = localizedScenario && JAPANESE_SCRIPT.test(localizedScenario.context ?? '');

    if (japaneseVocab.length > 0 || japaneseContext) {
      console.log(
        `  [FAIL] ${course.slug} (${targetLang}): ` +
          `${japaneseVocab.length}/${localizedVocab.length} vocab items still Japanese` +
          `${japaneseContext ? ' AND scenario context still Japanese' : ''}`,
      );
      if (japaneseVocab.length > 0) {
        console.log(`         Japanese words: ${japaneseVocab.map((v) => v.targetText).join(', ')}`);
      }
      failures++;
    } else {
      console.log(`  [ok]   ${course.slug} (${targetLang}): ${localizedVocab.length} vocab items localized`);
    }
  }

  console.log(`\n=== Checked ${checked} courses, ${failures} failing. ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
