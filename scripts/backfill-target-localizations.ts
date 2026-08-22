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
      npm run db:backfill-target-localizations                      # all scenarios+situations+goals, all non-ja target languages
      npm run db:backfill-target-localizations -- --lang=fr         # single target language
      npm run db:backfill-target-localizations -- --lang=fr --limit=3
      npm run db:backfill-target-localizations -- --only=scenarios  # or --only=situations / --only=goals
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
  scenarioGoals,
  scenarioGoalLocalizations,
} from '../src/schema';
import { eq, and, inArray, asc } from 'drizzle-orm';
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

interface GeneratedGoal {
  goalText?: string;
  targetPhrase?: string;
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
Write every field in ${langName}, except userCharacterName which may stay as a generic learner name.
CRITICAL: Never output "___" or any bracketed placeholder — always write complete, natural sentences with concrete examples.`;
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
  "learningGoals": "... (complete, natural description of what the learner will practice — no blanks or templates)",
  "focusPills": "... (same '|||'-delimited format and number of topics as the original, translated/adapted — no blanks)"
}
Write every field in ${langName}.
CRITICAL: Never output "___" or any bracketed placeholder like "[word]" — every field must be a complete, natural sentence with concrete wording. For learningGoals/focusPills, give concrete example phrases (e.g. "ask Where is the market?") not templates (never "Where is the ___?").`;
}

function buildGoalsPrompt(
  langName: string,
  langCode: string,
  sc: typeof scenarios.$inferSelect,
  scLoc: typeof scenarioLocalizations.$inferSelect | null,
  goals: Array<typeof scenarioGoals.$inferSelect>,
): string {
  const locBlock = scLoc
    ? `The scenario has ALREADY been reimagined for a ${langName}-speaking context:
Localized title: ${scLoc.title ?? sc.title}
Localized context: ${scLoc.context ?? sc.context}
AI character: ${scLoc.aiCharacterName ?? sc.aiCharacterName} (${scLoc.aiCharacterRole ?? sc.aiCharacterRole})
User character: ${scLoc.userCharacterName ?? sc.userCharacterName} (${scLoc.userCharacterRole ?? sc.userCharacterRole})

Adapt each goal so it fits THAT reimagined scene.`
    : `The base scenario is titled "${sc.title}" (Japan-flavored). Adapt each goal naturally for a ${langName}-speaking context.`;

  const goalList = goals.map((g, i) =>
    `${i + 1}. goalText: ${g.goalText}\n   targetPhrase: ${g.targetPhrase ?? '(none)'}`).join('\n');

  return `You are adapting the learning goals of a language-learning roleplay scenario for a learner studying ${langName} (${langCode}) for business/travel purposes.

${locBlock}

Base goals (Japan-flavored, preserve the order — there are exactly ${goals.length}):
${goalList}

For each goal:
- "goalText": rewrite in ${langName}, consistent with the reimagined scene.
- "targetPhrase": replace with an equivalent natural phrase in ${langName} that fits the reimagined scene and characters — do NOT translate the Japanese phrase literally. Keep it short (under 200 characters), realistic for a learner to say aloud.

Return strictly a JSON array (no markdown, no code fences) of exactly ${goals.length} objects, in the same order:
[{"goalText": "...", "targetPhrase": "..."}]
Write every field in ${langName}.
CRITICAL: Never output "___" or any bracketed placeholder like "[Name]" — every goal must be a complete, natural sentence with concrete wording.`;
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

      for (const k of Object.keys(parsed) as Array<keyof GeneratedScenario>) {
        if (typeof parsed[k] === 'string') parsed[k] = (parsed[k] as string).replace(/___/g, '').trim() as any;
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

      for (const k of Object.keys(parsed) as Array<keyof GeneratedSituation>) {
        if (typeof parsed[k] === 'string') parsed[k] = (parsed[k] as string).replace(/___/g, '').trim() as any;
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

async function backfillGoals(
  provider: AIProvider,
  langCode: string,
  langName: string,
  limit: number | null,
  dryRun: boolean,
): Promise<{ processed: number; written: number }> {
  const scenarioRows = await db.select().from(scenarios).orderBy(scenarios.id);
  const goalsByScenario = new Map<number, Array<typeof scenarioGoals.$inferSelect>>();
  const allGoals = await db
    .select()
    .from(scenarioGoals)
    .where(inArray(scenarioGoals.scenarioId, scenarioRows.map((s) => s.id)))
    .orderBy(asc(scenarioGoals.scenarioId), asc(scenarioGoals.sequenceOrder));
  for (const g of allGoals) {
    if (!goalsByScenario.has(g.scenarioId)) goalsByScenario.set(g.scenarioId, []);
    goalsByScenario.get(g.scenarioId)!.push(g);
  }

  const existing = await db
    .select({ scenarioGoalId: scenarioGoalLocalizations.scenarioGoalId })
    .from(scenarioGoalLocalizations)
    .where(and(
      eq(scenarioGoalLocalizations.languageCode, langCode),
      inArray(scenarioGoalLocalizations.scenarioGoalId, allGoals.map((g) => g.id)),
    ));
  // A scenario's goals are generated in one batch, but individual goal rows
  // can be purged independently (content fixes) — so only treat a scenario as
  // done when EVERY one of its goals has a row. Partial coverage falls through
  // and lets onConflictDoNothing absorb the already-present goals.
  const coveredGoalIds = new Set(existing.map((r) => r.scenarioGoalId));

  let processed = 0;
  let written = 0;

  for (const sc of scenarioRows) {
    const goals = goalsByScenario.get(sc.id);
    if (!goals || goals.length === 0) continue;
    if (goals.every((g) => coveredGoalIds.has(g.id))) {
      console.log(`  [skip] scenario "${sc.title}" already has ${langCode} goals`);
      continue;
    }
    if (limit != null && processed >= limit) break;
    processed++;

    try {
      const [scLoc] = await db
        .select()
        .from(scenarioLocalizations)
        .where(and(eq(scenarioLocalizations.scenarioId, sc.id), eq(scenarioLocalizations.languageCode, langCode)))
        .limit(1);
      const raw = await provider.generateJSON(buildGoalsPrompt(langName, langCode, sc, scLoc ?? null, goals), []);
      const parsed = JSON.parse(raw) as GeneratedGoal[];
      if (!Array.isArray(parsed) || parsed.length !== goals.length) {
        throw new Error(`expected JSON array of ${goals.length} goal(s), got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
      }
      for (const g of parsed) {
        if (g.goalText) g.goalText = g.goalText.replace(/___/g, '').replace(/\s{2,}/g, ' ').trim();
        if (g.targetPhrase) g.targetPhrase = g.targetPhrase.replace(/___/g, '').replace(/\s{2,}/g, ' ').trim();
      }

      if (dryRun) {
        console.log(`  [dry-run] scenario "${sc.title}" (${langCode}):`, JSON.stringify(parsed, null, 2));
        continue;
      }

      let inserted = 0;
      for (let i = 0; i < goals.length; i++) {
        const res = await db.insert(scenarioGoalLocalizations).values({
          scenarioGoalId: goals[i].id,
          languageCode: langCode,
          goalText: parsed[i].goalText ?? null,
          targetPhrase: parsed[i].targetPhrase ?? null,
        }).onConflictDoNothing().returning({ id: scenarioGoalLocalizations.id });
        inserted += res.length;
      }
      await cacheDel(cacheKeys.goalLocalizations(sc.id, langCode));
      written += inserted;
      console.log(`  [ok] scenario "${sc.title}" -> ${inserted}/${goals.length} goal(s) (${langCode})`);
    } catch (err) {
      console.warn(`  [ERR] scenario "${sc.title}" (${langCode}):`, err instanceof Error ? err.message : String(err));
    }
  }

  return { processed, written };
}

async function main(): Promise<void> {
  const langFilter = parseArg('lang');
  const only = parseArg('only'); // 'scenarios' | 'situations' | 'goals' | null (all)
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
  let totalGoals = 0;

  for (const lang of langs) {
    console.log(`\n=== ${lang.name} (${lang.code}) ===`);

    if (only !== 'situations' && only !== 'goals') {
      console.log(' Scenarios:');
      const r = await backfillScenarios(provider, lang.code, lang.name, limit, dryRun);
      totalScenarios += r.written;
    }

    if (only !== 'scenarios' && only !== 'goals') {
      console.log(' Situations:');
      const r = await backfillSituations(provider, lang.code, lang.name, limit, dryRun);
      totalSituations += r.written;
    }

    if (only !== 'scenarios' && only !== 'situations') {
      console.log(' Goals:');
      const r = await backfillGoals(provider, lang.code, lang.name, limit, dryRun);
      totalGoals += r.written;
    }
  }

  console.log(`\n=== Done. Wrote ${totalScenarios} scenario localization(s), ${totalSituations} situation localization(s), ${totalGoals} goal localization(s). ===`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
