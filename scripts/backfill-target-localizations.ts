/* ─────────────────────────────────────────────────────────────
   One-off backfill: culturally-adapted target-language content
   for scenarios and situations.

   Problem: the 20 base `scenarios` (src/seed.ts) and all `situations`
   (scripts/seed-domain-data.ts) are hardcoded Japan settings (Tokyo/Osaka,
   Hana/Tanaka, konbini/izakaya). `scenarioLocalizations` only translates
   that Japan-shaped content 1:1 (see generate-scenario-localizations.ts) —
   a French learner still gets a scene set in Tokyo, just in French.
   `situations` has no localization table at all, so it always falls back
   to the raw Japan-shaped base text regardless of language.

   This script instead asks the AI provider to REIMAGINE each scenario /
   situation for a learner of the target language — inventing locally
   appropriate place names, character names, and setting instead of
   translating the Japanese/Japan-flavored original. Results are stored in
   the same `scenarioLocalizations` / `situationLocalizations` tables (they
   are keyed by (id, languageCode), so a row written here is
   indistinguishable at read time from one written by the older literal
   translator — only the generation prompt differs).

   Usage:
     npm run db:backfill-target-localizations                      # all scenarios+situations, all non-ja target languages
     npm run db:backfill-target-localizations -- --lang=fr         # single target language
     npm run db:backfill-target-localizations -- --lang=fr --limit=3
     npm run db:backfill-target-localizations -- --only=scenarios  # or --only=situations
     npm run db:backfill-target-localizations -- --dry-run         # print generated JSON, insert nothing

   Idempotent — skips any (id, languageCode) that already has a row, so
   reruns only fill gaps. Failures are logged per id/language and do not
   halt the run.
   ───────────────────────────────────────────────────────────── */
import { db } from '../src/db';
import {
  scenarios,
  scenarioLocalizations,
  situations,
  situationLocalizations,
} from '../src/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { TARGET_LANGUAGES } from '../lib/language';
import { getAIProvider, type AIProvider } from '../lib/ai-providers';
import { cacheDel, cacheKeys } from '../lib/cache';

const BASE_LANG = 'ja'; // nothing to backfill for the base language itself

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface GeneratedScenario {
  title?: string;
  context?: string;
  learningGoals?: string;
  aiCharacterName?: string;
  aiCharacterRole?: string;
  userCharacterName?: string;
  userCharacterRole?: string;
}

interface GeneratedSituation {
  title?: string;
  context?: string;
  learningGoals?: string;
  focusPills?: string;
}

function buildScenarioPrompt(langName: string, langCode: string, sc: typeof scenarios.$inferSelect): string {
  return `You are designing a language-learning roleplay scenario for a learner studying ${langName} (${langCode}) for business/travel purposes.

Reimagine the following scenario for that learner. Do NOT translate it literally — invent a locally/culturally appropriate setting, place names, and character names for a ${langName}-speaking context. Keep the same TYPE of situation (the general activity, difficulty, and learning intent), but the location, character names, and cultural details should feel native to ${langName} culture, not Japan.

Original scenario (Japan-flavored, for TYPE/DIFFICULTY reference only — do not reuse its place/character names):
Title: ${sc.title}
Context: ${sc.context}
Learning goals: ${sc.learningGoals}
AI character name: ${sc.aiCharacterName}
AI character role: ${sc.aiCharacterRole}
User character name: ${sc.userCharacterName}
User character role: ${sc.userCharacterRole}

Return strictly a JSON object (no markdown, no code fences) matching exactly this schema:
{
  "title": "...",
  "context": "... (2-4 sentences, culturally grounded in a ${langName}-speaking setting)",
  "learningGoals": "...",
  "aiCharacterName": "... (a name natural to a ${langName}-speaking country)",
  "aiCharacterRole": "...",
  "userCharacterName": "... (keep a generic learner-appropriate name, can be non-local since the user plays this role)",
  "userCharacterRole": "..."
}
Write every field in ${langName}, except userCharacterName which may stay as a generic learner name.`;
}

function buildSituationPrompt(langName: string, langCode: string, st: typeof situations.$inferSelect): string {
  return `You are designing a short language-learning roleplay situation for a learner studying ${langName} (${langCode}) for business/travel purposes.

Reimagine the following situation for that learner. Do NOT translate it literally — invent locally/culturally appropriate details for a ${langName}-speaking context instead of a Japan-flavored one. Keep the same TYPE of situation (the general activity and difficulty) and the same skill focus.

Original situation (Japan-flavored, for TYPE/DIFFICULTY reference only):
Title: ${st.title}
Context: ${st.context}
Learning goals: ${st.learningGoals}
Focus pills (topics, "|||"-delimited): ${st.focusPills}

Return strictly a JSON object (no markdown, no code fences) matching exactly this schema:
{
  "title": "...",
  "context": "... (1-3 sentences, culturally grounded in a ${langName}-speaking setting)",
  "learningGoals": "...",
  "focusPills": "... (same '|||'-delimited format and number of topics as the original, translated/adapted)"
}
Write every field in ${langName}.`;
}

async function backfillScenarios(
  provider: AIProvider,
  langCode: string,
  langName: string,
  limit: number | null,
  dryRun: boolean,
): Promise<{ processed: number; written: number }> {
  const scenarioRows = await db.select().from(scenarios).orderBy(scenarios.id);

  const existing = await db
    .select({ scenarioId: scenarioLocalizations.scenarioId })
    .from(scenarioLocalizations)
    .where(and(
      eq(scenarioLocalizations.languageCode, langCode),
      inArray(scenarioLocalizations.scenarioId, scenarioRows.map((s) => s.id)),
    ));
  const existingIds = new Set(existing.map((r) => r.scenarioId));

  let processed = 0;
  let written = 0;

  for (const sc of scenarioRows) {
    if (existingIds.has(sc.id)) {
      console.log(`  [skip] scenario "${sc.title}" already has ${langCode}`);
      continue;
    }
    if (limit != null && processed >= limit) break;
    processed++;

    try {
      const raw = await provider.generateJSON(buildScenarioPrompt(langName, langCode, sc), []);
      const parsed = JSON.parse(raw) as GeneratedScenario;

      if (dryRun) {
        console.log(`  [dry-run] scenario "${sc.title}" (${langCode}):`, JSON.stringify(parsed, null, 2));
        continue;
      }

      await db.insert(scenarioLocalizations).values({
        scenarioId: sc.id,
        languageCode: langCode,
        title: parsed.title ?? null,
        context: parsed.context ?? null,
        learningGoals: parsed.learningGoals ?? null,
        aiCharacterName: parsed.aiCharacterName ?? null,
        aiCharacterRole: parsed.aiCharacterRole ?? null,
        userCharacterName: parsed.userCharacterName ?? null,
        userCharacterRole: parsed.userCharacterRole ?? null,
      }).onConflictDoNothing();
      await cacheDel(cacheKeys.scenarioLocalization(sc.id, langCode));
      written++;
      console.log(`  [ok] scenario "${sc.title}" -> "${parsed.title}" (${langCode})`);
    } catch (err) {
      console.warn(`  [ERR] scenario "${sc.title}" (${langCode}):`, err instanceof Error ? err.message : String(err));
    }
  }

  return { processed, written };
}

async function backfillSituations(
  provider: AIProvider,
  langCode: string,
  langName: string,
  limit: number | null,
  dryRun: boolean,
): Promise<{ processed: number; written: number }> {
  const situationRows = await db.select().from(situations).orderBy(situations.id);

  const existing = await db
    .select({ situationId: situationLocalizations.situationId })
    .from(situationLocalizations)
    .where(and(
      eq(situationLocalizations.languageCode, langCode),
      inArray(situationLocalizations.situationId, situationRows.map((s) => s.id)),
    ));
  const existingIds = new Set(existing.map((r) => r.situationId));

  let processed = 0;
  let written = 0;

  for (const st of situationRows) {
    if (existingIds.has(st.id)) {
      console.log(`  [skip] situation "${st.title}" already has ${langCode}`);
      continue;
    }
    if (limit != null && processed >= limit) break;
    processed++;

    try {
      const raw = await provider.generateJSON(buildSituationPrompt(langName, langCode, st), []);
      const parsed = JSON.parse(raw) as GeneratedSituation;

      if (dryRun) {
        console.log(`  [dry-run] situation "${st.title}" (${langCode}):`, JSON.stringify(parsed, null, 2));
        continue;
      }

      await db.insert(situationLocalizations).values({
        situationId: st.id,
        languageCode: langCode,
        title: parsed.title ?? null,
        context: parsed.context ?? null,
        learningGoals: parsed.learningGoals ?? null,
        focusPills: parsed.focusPills ?? null,
      }).onConflictDoNothing();
      await cacheDel(cacheKeys.situationLocalization(st.id, langCode));
      written++;
      console.log(`  [ok] situation "${st.title}" -> "${parsed.title}" (${langCode})`);
    } catch (err) {
      console.warn(`  [ERR] situation "${st.title}" (${langCode}):`, err instanceof Error ? err.message : String(err));
    }
  }

  return { processed, written };
}

async function main(): Promise<void> {
  const langFilter = parseArg('lang');
  const only = parseArg('only'); // 'scenarios' | 'situations' | null (both)
  const limitRaw = parseArg('limit');
  let limit: number | null = null;
  if (limitRaw !== null && limitRaw !== undefined) {
    const parsedLimit = Number(limitRaw);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      throw new Error(`Invalid --limit value "${limitRaw}" — expected a positive number. Refusing to run without a limit.`);
    }
    limit = Math.floor(parsedLimit);
  }
  const dryRun = hasFlag('dry-run');

  console.log('=== Target-Language Localization Backfill ===');
  if (dryRun) console.log('(dry run — nothing will be written)');
  console.log('');

  let provider: AIProvider;
  try {
    provider = await getAIProvider();
  } catch (err) {
    console.error('Failed to construct an AI provider. Set AI_PROVIDER + its API key in the environment first.');
    console.error(String(err));
    process.exit(1);
  }

  const langs = TARGET_LANGUAGES.filter((l) => l.code !== BASE_LANG && (!langFilter || l.code === langFilter));
  if (langs.length === 0) {
    console.log('No matching target languages to backfill.');
    return;
  }

  let totalScenarios = 0;
  let totalSituations = 0;

  for (const lang of langs) {
    console.log(`\n=== ${lang.name} (${lang.code}) ===`);

    if (only !== 'situations') {
      console.log(' Scenarios:');
      const r = await backfillScenarios(provider, lang.code, lang.name, limit, dryRun);
      totalScenarios += r.written;
    }

    if (only !== 'scenarios') {
      console.log(' Situations:');
      const r = await backfillSituations(provider, lang.code, lang.name, limit, dryRun);
      totalSituations += r.written;
    }
  }

  console.log(`\n=== Done. Wrote ${totalScenarios} scenario localization(s), ${totalSituations} situation localization(s). ===`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
