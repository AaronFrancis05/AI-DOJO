/* ─────────────────────────────────────────────────────────────
   Regression check: confirm course content is actually localized.

   Courses are language-neutral templates: the learner picks a target
   language when they enrol. For every active template, loads each
   scenario used by its lessons, and for each supported target
   language (everything except the Japanese base vocabulary script) runs
   the same localization merge the API uses. Flags any (template, lang)
   whose drilled vocabulary (or scenario context) still contains
   Japanese script — a sign the localization rows are missing.

   Then, native coverage: for the target language (--target, default
   English) and every enabled native language, how many scenarios,
   situations, goals and words have a (target, native) explanation row.
   Anything below 100% fails — this is the release gate for "serve all
   nations" (PLAN.md 2.3).

   Usage: npm run db:check-localization
          npm run db:check-localization -- --target=en --native-only
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
  scenarios,
  situations,
  scenarioGoals,
  scenarioNativeLocalizations,
  situationNativeLocalizations,
  scenarioGoalNativeLocalizations,
  vocabularyNativeNotes,
} from '../src/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { applyTargetLanguageVocab } from '../lib/localization';
import { TARGET_LANGUAGES, NATIVE_LANGUAGES, BASE_CONTENT_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '../lib/language';
import { loadLanguageCatalog } from '../lib/language-registry';

const JAPANESE_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]/;

// Everything except the Japanese base vocabulary script needs localization.
// A function, not a module-level constant: the catalogue is hydrated from the
// `languages` table inside main(), which runs after this module is evaluated,
// so a constant here would only ever list the compiled-in languages.
const targetCodes = () => TARGET_LANGUAGES.map((l) => l.code).filter((c) => c !== BASE_CONTENT_LANGUAGE);

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

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? null;
}

// Counts distinct covered ids per native language in one query per table.
async function coveredByNative(
  table: typeof scenarioNativeLocalizations | typeof situationNativeLocalizations
    | typeof scenarioGoalNativeLocalizations | typeof vocabularyNativeNotes,
  idColumn: typeof scenarioNativeLocalizations.scenarioId | typeof situationNativeLocalizations.situationId
    | typeof scenarioGoalNativeLocalizations.scenarioGoalId | typeof vocabularyNativeNotes.vocabularyId,
  targetLanguage: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ native: table.nativeLanguage, n: sql<number>`count(distinct ${idColumn})` })
    .from(table)
    .where(eq(table.targetLanguage, targetLanguage))
    .groupBy(table.nativeLanguage);
  return new Map(rows.map((r) => [r.native, Number(r.n)]));
}

async function checkNativeCoverage(targetLanguage: string): Promise<number> {
  console.log(`\n=== Native-language coverage for ${targetLanguage} learners ===\n`);
  const count = async (t: typeof scenarios | typeof situations | typeof scenarioGoals) =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(t))[0]?.n ?? 0);
  const [scenarioTotal, situationTotal, goalTotal, vocabTotal] = await Promise.all([
    count(scenarios),
    count(situations),
    count(scenarioGoals),
    db.select({ n: sql<number>`count(*)` }).from(vocabulary)
      .where(eq(vocabulary.languageCode, BASE_CONTENT_LANGUAGE)).then((r) => Number(r[0]?.n ?? 0)),
  ]);
  const [sc, st, go, vo] = await Promise.all([
    coveredByNative(scenarioNativeLocalizations, scenarioNativeLocalizations.scenarioId, targetLanguage),
    coveredByNative(situationNativeLocalizations, situationNativeLocalizations.situationId, targetLanguage),
    coveredByNative(scenarioGoalNativeLocalizations, scenarioGoalNativeLocalizations.scenarioGoalId, targetLanguage),
    coveredByNative(vocabularyNativeNotes, vocabularyNativeNotes.vocabularyId, targetLanguage),
  ]);
  const pct = (n: number, total: number) => (total === 0 ? 100 : Math.floor((n / total) * 100));
  const cell = (n: number, total: number) => `${String(pct(n, total)).padStart(3)}% (${n}/${total})`;

  let failing = 0;
  console.log('  native  scenarios           situations          goals               word tips');
  for (const native of NATIVE_LANGUAGES) {
    // An English speaker learning English needs no explanation layer.
    if (native.code === targetLanguage) continue;
    const counts = [
      [sc.get(native.code) ?? 0, scenarioTotal],
      [st.get(native.code) ?? 0, situationTotal],
      [go.get(native.code) ?? 0, goalTotal],
      [vo.get(native.code) ?? 0, vocabTotal],
    ] as const;
    const ok = counts.every(([n, total]) => n >= total);
    if (!ok) failing++;
    console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${native.code.padEnd(5)} ${counts.map(([n, total]) => cell(n, total).padEnd(20)).join('')}`);
  }
  console.log(`\n=== ${failing} native language(s) below full coverage. Fill with: npm run db:backfill-target-localizations -- --only=native --target=${targetLanguage} ===`);
  return failing;
}

async function main(): Promise<void> {
  // Hydrates lib/language.ts from the `languages` table, so this script covers
  // languages an admin added as well as the compiled-in ones. Without it the
  // module-level constants are all a CLI process ever sees.
  await loadLanguageCatalog();

  const nativeTarget = argValue('target') ?? DEFAULT_TARGET_LANGUAGE;
  if (process.argv.includes('--native-only')) {
    const failing = await checkNativeCoverage(nativeTarget);
    if (failing > 0) process.exit(1);
    return;
  }

  console.log('=== Course Localization Check ===\n');

  const courseRows = await db.select().from(courses).where(eq(courses.isActive, true));

  let failures = 0;
  let checked = 0;

  for (const course of courseRows) {
    const scenarioIds = await getCourseScenarioIds(course.id);

    for (const lang of targetCodes()) {
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
  const nativeFailing = await checkNativeCoverage(nativeTarget);
  if (failures > 0 || nativeFailing > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
