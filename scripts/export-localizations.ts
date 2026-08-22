// Exports all localization rows (scenario / situation / vocabulary) from the
// live database into a versioned JSON fixture that `src/seed.ts` replays on
// fresh databases — no LLM calls needed at seed time.
//
// Rows are keyed by stable business keys (scenario title, domain slug +
// situation title, scenario title + vocab target text), NOT numeric ids,
// because serial ids differ between environments.
//
// Re-run this after regenerating content via db:backfill-target-localizations,
// then commit the fixture diff so content changes are reviewable.
//
// Usage: npm run db:export-localizations
import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import {
  scenarios, situations, domains, vocabulary,
  scenarioLocalizations, situationLocalizations, vocabularyLocalizations,
} from '../src/schema';

interface ScenarioLocFixture {
  scenario: string;
  languageCode: string;
  title: string | null;
  context: string | null;
  learningGoals: string | null;
  aiCharacterName: string | null;
  aiCharacterRole: string | null;
  userCharacterName: string | null;
  userCharacterRole: string | null;
}

interface SituationLocFixture {
  domainSlug: string;
  situation: string;
  languageCode: string;
  title: string | null;
  context: string | null;
  learningGoals: string | null;
  focusPills: string | null;
}

interface VocabLocFixture {
  scenario: string;
  targetText: string;
  languageCode: string;
  translation: string | null;
  usageTip: string | null;
}

interface LocalizationFixture {
  version: number;
  counts: { scenarios: number; situations: number; vocabulary: number };
  scenarioLocalizations: ScenarioLocFixture[];
  situationLocalizations: SituationLocFixture[];
  vocabularyLocalizations: VocabLocFixture[];
}

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'localizations.json');

function assertUnique(keys: string[][]) {
  const seen = new Set<string>();
  for (const key of keys) {
    const joined = key.join('\u0000');
    if (seen.has(joined)) throw new Error(`duplicate business key in export: ${key.join(' / ')}`);
    seen.add(joined);
  }
}

async function main() {
  console.log('=== Localization Fixture Export ===\n');

  const scenRows = await db
    .select({
      scenarioTitle: scenarios.title,
      languageCode: scenarioLocalizations.languageCode,
      title: scenarioLocalizations.title,
      context: scenarioLocalizations.context,
      learningGoals: scenarioLocalizations.learningGoals,
      aiCharacterName: scenarioLocalizations.aiCharacterName,
      aiCharacterRole: scenarioLocalizations.aiCharacterRole,
      userCharacterName: scenarioLocalizations.userCharacterName,
      userCharacterRole: scenarioLocalizations.userCharacterRole,
    })
    .from(scenarioLocalizations)
    .innerJoin(scenarios, eq(scenarioLocalizations.scenarioId, scenarios.id));

  const sitRows = await db
    .select({
      domainSlug: domains.slug,
      situationTitle: situations.title,
      languageCode: situationLocalizations.languageCode,
      title: situationLocalizations.title,
      context: situationLocalizations.context,
      learningGoals: situationLocalizations.learningGoals,
      focusPills: situationLocalizations.focusPills,
    })
    .from(situationLocalizations)
    .innerJoin(situations, eq(situationLocalizations.situationId, situations.id))
    .innerJoin(domains, eq(situations.domainId, domains.id));

  const vocabRows = await db
    .select({
      scenarioTitle: scenarios.title,
      targetText: vocabulary.targetText,
      languageCode: vocabularyLocalizations.languageCode,
      translation: vocabularyLocalizations.translation,
      usageTip: vocabularyLocalizations.usageTip,
    })
    .from(vocabularyLocalizations)
    .innerJoin(vocabulary, eq(vocabularyLocalizations.vocabularyId, vocabulary.id))
    .innerJoin(scenarios, eq(vocabulary.scenarioId, scenarios.id));

  assertUnique(scenRows.map((r) => [r.scenarioTitle, r.languageCode]));
  assertUnique(sitRows.map((r) => [r.domainSlug, r.situationTitle, r.languageCode]));
  assertUnique(vocabRows.map((r) => [r.scenarioTitle, r.targetText, r.languageCode]));

  const fixture: LocalizationFixture = {
    version: 1,
    counts: {
      scenarios: scenRows.length,
      situations: sitRows.length,
      vocabulary: vocabRows.length,
    },
    scenarioLocalizations: scenRows.map((r) => ({
      scenario: r.scenarioTitle,
      languageCode: r.languageCode,
      title: r.title,
      context: r.context,
      learningGoals: r.learningGoals,
      aiCharacterName: r.aiCharacterName,
      aiCharacterRole: r.aiCharacterRole,
      userCharacterName: r.userCharacterName,
      userCharacterRole: r.userCharacterRole,
    })),
    situationLocalizations: sitRows.map((r) => ({
      domainSlug: r.domainSlug,
      situation: r.situationTitle,
      languageCode: r.languageCode,
      title: r.title,
      context: r.context,
      learningGoals: r.learningGoals,
      focusPills: r.focusPills,
    })),
    vocabularyLocalizations: vocabRows.map((r) => ({
      scenario: r.scenarioTitle,
      targetText: r.targetText,
      languageCode: r.languageCode,
      translation: r.translation,
      usageTip: r.usageTip,
    })),
  };

  fixture.scenarioLocalizations.sort((a, b) =>
    a.scenario.localeCompare(b.scenario) || a.languageCode.localeCompare(b.languageCode));
  fixture.situationLocalizations.sort((a, b) =>
    a.domainSlug.localeCompare(b.domainSlug) || a.situation.localeCompare(b.situation)
    || a.languageCode.localeCompare(b.languageCode));
  fixture.vocabularyLocalizations.sort((a, b) =>
    a.scenario.localeCompare(b.scenario) || a.targetText.localeCompare(b.targetText)
    || a.languageCode.localeCompare(b.languageCode));

  await mkdir(dirname(FIXTURE_PATH), { recursive: true });
  await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n', 'utf8');

  const sizeKb = Math.round(readFileSync(FIXTURE_PATH).byteLength / 1024);
  console.log(`Wrote ${FIXTURE_PATH}`);
  console.log(`  scenario_localizations:  ${scenRows.length}`);
  console.log(`  situation_localizations: ${sitRows.length}`);
  console.log(`  vocabulary_localizations: ${vocabRows.length}`);
  console.log(`  total rows: ${scenRows.length + sitRows.length + vocabRows.length} (${sizeKb} KB)`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
