/* ─────────────────────────────────────────────────────────────
   Regression check: confirm course content is actually localized.

   Courses are language-neutral templates: the learner picks a target
   language when they enrol. For every active template, loads each
   scenario used by its lessons, and for each supported target
   language (everything except the Japanese base vocabulary script) runs
   the same localization merge the API uses. Flags any (template, lang)
   whose drilled vocabulary (or scenario context) still contains
   Japanese script — a sign the localization rows are missing.

   Usage: npm run db:check-localization
   ───────────────────────────────────────────────────────────── */
import { db } from '../src/db';
import {
  courses,
  courseLevels,
  units,
  lessons,
  vocabulary,
  scenarioLocalizations,
  vocabularyLocalizations,
} from '../src/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { applyTargetLanguageVocab } from '../lib/localization';
import { TARGET_LANGUAGES } from '../lib/language';

const JAPANESE_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]/;

// Everything except the Japanese base vocabulary script needs localization.
const TARGET_CODES = TARGET_LANGUAGES.map((l) => l.code).filter((c) => c !== 'ja');

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

// Distinct scenarioIds used across a template's active lessons.
async function getCourseScenarioIds(courseId: number): Promise<number[]> {
  const rows = await db
    .select({ scenarioId: lessons.scenarioId })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courseLevels, eq(units.levelId, courseLevels.id))
    .where(and(eq(courseLevels.courseId, courseId), eq(lessons.isActive, true)));
  const seen = new Set<number | null>();
  const ids: number[] = [];
  for (const r of rows) {
    if (r.scenarioId != null && !seen.has(r.scenarioId)) {
      seen.add(r.scenarioId);
      ids.push(r.scenarioId);
    }
  }
  return ids;
}

// Validates every lesson-scenario of a template for a single target language.
// Returns an array of failure messages, or [] if the (template, lang) is OK.
async function checkTemplateLang(course: typeof courses.$inferSelect, lang: string, scenarioIds: number[]): Promise<{ ok: boolean; message: string }> {
  if (scenarioIds.length === 0) {
    return { ok: true, message: 'no scenario-linked lessons' };
  }

  const failures: string[] = [];
  let vocabChecked = 0;

  if (scenarioIds.length > 0) {
    const vocabRows = await db
      .select()
      .from(vocabulary)
      .where(inArray(vocabulary.scenarioId, scenarioIds))
      .orderBy(vocabulary.id);
    const vocabByScenario = new Map<number, typeof vocabRows>();
    for (const v of vocabRows) {
      const list = vocabByScenario.get(v.scenarioId) ?? [];
      list.push(v);
      vocabByScenario.set(v.scenarioId, list);
    }

    for (const sid of scenarioIds) {
      const rowVocab = vocabByScenario.get(sid) ?? [];

      const locs = await loadTargetLocalizations(sid, lang);
      const localizedVocab = locs.vocabLoc.size > 0 ? applyTargetLanguageVocab(rowVocab, locs.vocabLoc) : rowVocab;
      const japaneseVocab = localizedVocab.filter((v) => JAPANESE_SCRIPT.test(v.targetText));

      let coverageIssue = '';
      // The base scenario is English, so only non-English targets must have a
      // localization row with a real context (not just a title-only row).
      if (lang !== 'en') {
        if (!locs.scenarioLoc) {
          coverageIssue = 'scenario localization MISSING';
        } else if (!locs.scenarioLoc.context) {
          coverageIssue = 'scenario context is NULL (title-only row)';
        }
      }

      const parts: string[] = [];
      if (japaneseVocab.length > 0) parts.push(`${japaneseVocab.length}/${localizedVocab.length} vocab items still Japanese`);
      if (coverageIssue) parts.push(coverageIssue);

      if (parts.length > 0) {
        failures.push(`scenario ${sid}: ${parts.join('; ')}`);
      } else {
        vocabChecked += localizedVocab.length;
      }
    }
  }

  if (failures.length > 0) {
    return { ok: false, message: failures.join(' | ') };
  }
  return { ok: true, message: `${vocabChecked} vocab items localized across ${scenarioIds.length} scenarios` };
}

async function main(): Promise<void> {
  console.log('=== Course Localization Check ===\n');

  const courseRows = await db.select().from(courses).where(eq(courses.isActive, true));

  let failures = 0;
  let checked = 0;

  for (const course of courseRows) {
    const scenarioIds = await getCourseScenarioIds(course.id);

    for (const lang of TARGET_CODES) {
      checked++;
      const result = await checkTemplateLang(course, lang, scenarioIds);
      if (result.ok) {
        console.log(`  [ok]   ${course.slug} (${lang}): ${result.message}`);
      } else {
        console.log(`  [FAIL] ${course.slug} (${lang}): ${result.message}`);
        failures++;
      }
    }
  }

  console.log(`\n=== Checked ${checked} course/language combos, ${failures} failing. ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
