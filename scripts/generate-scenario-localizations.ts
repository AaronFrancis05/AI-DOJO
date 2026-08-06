/* ─────────────────────────────────────────────────────────────
   One-off generator for per-language course localizations.

   The base `scenarios` rows are written in English and the base
   `vocabulary` rows are Japanese. All 31 "courses" reuse those same
   scenarioIds, so a "Survival French for Uganda" course previously
   drilled Japanese words. This script asks the configured AI provider
   to translate each course scenario + its vocabulary into every target
   language and upserts the results into `scenarioLocalizations` /
   `vocabularyLocalizations` (the schema already had the tables).

   Usage:
     npm run db:localize                    # all languages
     npm run db:localize -- --lang=fr       # single language
     npm run db:localize -- --lang=fr --limit=3   # first 3 scenarios

   The script is idempotent — scenarios/vocab that are already fully
   localized for a language are skipped (no re-generation, no extra AI
   cost). `--limit` caps how many scenarios are processed per language.
   ───────────────────────────────────────────────────────────── */
import { db } from '../src/db';
import {
  scenarios,
  vocabulary,
  scenarioLocalizations,
  vocabularyLocalizations,
  lessons,
} from '../src/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { TARGET_LANGUAGES } from '../lib/language';
import { getAIProvider } from '../lib/ai-providers';
import { cacheDel, cacheKeys } from '../lib/cache';

const BASE_SCRIPT_LANG = 'ja'; // base vocabulary rows are Japanese
const BASE_SCENARIO_LANG = 'en'; // base scenario rows are English

interface GeneratedVocabEntry {
  original?: string;
  targetText?: string;
  usageTip?: string;
}

interface GeneratedLocalization {
  scenario?: {
    title?: string;
    context?: string;
    learningGoals?: string;
    aiCharacterName?: string;
    aiCharacterRole?: string;
    userCharacterName?: string;
    userCharacterRole?: string;
  };
  vocabulary?: GeneratedVocabEntry[];
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function buildPrompt(langName: string, langCode: string, sc: typeof scenarios.$inferSelect, vocabItems: typeof vocabulary.$inferSelect[]): string {
  const vocabBlock = vocabItems.length > 0
    ? `Vocabulary items (base is Japanese, with English meaning):\n${vocabItems
        .map((v) => `- original: "${v.targetText}" | english meaning: "${v.translation}" | usageTip: "${v.usageTip ?? ''}"`)
        .join('\n')}`
    : 'Vocabulary items: none';

  return `You are localizing a language-learning scenario into ${langName} (${langCode}).

Base scenario (currently written in English):
Title: ${sc.title}
Context: ${sc.context}
Learning goals: ${sc.learningGoals}
AI character name: ${sc.aiCharacterName}
AI character role: ${sc.aiCharacterRole}
User character name: ${sc.userCharacterName}
User character role: ${sc.userCharacterRole}

${vocabBlock}

Translate every scenario field above into natural ${langName}. Keep the same meaning, tone, and character personality — do not invent new content. The setting stays the same; only the language changes.

Then, for EACH vocabulary item, produce the natural ${langName} word or short phrase that means the same thing as the base item. This is the word the learner will practice in ${langName} — it must NOT be the English meaning and must NOT stay Japanese.

Return strictly a JSON object (no markdown, no code fences) matching exactly this schema:
{
  "scenario": {
    "title": "...",
    "context": "...",
    "learningGoals": "...",
    "aiCharacterName": "...",
    "aiCharacterRole": "...",
    "userCharacterName": "...",
    "userCharacterRole": "..."
  },
  "vocabulary": [
    { "original": "<exact base targetText verbatim>", "targetText": "<${langCode} word/phrase>", "usageTip": "<brief usage tip in English>" }
  ]
}

The "vocabulary" array MUST contain exactly ${vocabItems.length} entries — one per base item — and each entry's "original" must match the base targetText exactly. "usageTip" should be a short English tip on when/how to use the word.`;
}

async function main(): Promise<void> {
  const langFilter = parseArg('lang');
  const limitRaw = parseArg('limit');
  const limit = limitRaw ? Number(limitRaw) : null;

  console.log('=== Scenario/Vocabulary Localization Generator ===\n');

  const lessonScenarioIds = (
    await db
      .selectDistinct({ scenarioId: lessons.scenarioId })
      .from(lessons)
      .where(sql`${lessons.scenarioId} IS NOT NULL`)
  ).map((r) => r.scenarioId as number);

  if (lessonScenarioIds.length === 0) {
    console.log('No course-linked scenarios found. Nothing to localize.');
    return;
  }

  const scenarioRows = await db
    .select()
    .from(scenarios)
    .where(inArray(scenarios.id, lessonScenarioIds))
    .orderBy(scenarios.id);

  const vocabByScenario = new Map<number, typeof vocabulary.$inferSelect[]>();
  for (const sc of scenarioRows) {
    const items = await db.select().from(vocabulary).where(eq(vocabulary.scenarioId, sc.id)).orderBy(vocabulary.id);
    vocabByScenario.set(sc.id, items);
  }

  console.log(`Loaded ${scenarioRows.length} course scenarios (${lessonScenarioIds.length} distinct scenarioIds).`);

  let provider;
  try {
    provider = await getAIProvider();
  } catch (err) {
    console.error('Failed to construct an AI provider. Set AI_PROVIDER + its API key in the environment first.');
    console.error(String(err));
    process.exit(1);
  }

  const langs = TARGET_LANGUAGES.filter((l) => !langFilter || l.code === langFilter);

  let totalInserted = 0;

  for (const lang of langs) {
    const needsScenario = lang.code !== BASE_SCENARIO_LANG && lang.code !== BASE_SCRIPT_LANG;
    const needsVocab = lang.code !== BASE_SCRIPT_LANG;
    if (!needsScenario && !needsVocab) continue; // the 'ja' base — nothing to localize

    console.log(`\n=== ${lang.name} (${lang.code}) ===`);

    let processed = 0;
    for (const sc of scenarioRows) {
      if (limit != null && processed >= limit) break;
      const vocabItems = vocabByScenario.get(sc.id) ?? [];

      const [existingScenarioLoc] = needsScenario
        ? await db
            .select({ id: scenarioLocalizations.id })
            .from(scenarioLocalizations)
            .where(and(
              eq(scenarioLocalizations.scenarioId, sc.id),
              eq(scenarioLocalizations.languageCode, lang.code),
            ))
            .limit(1)
        : [null];

      const existingVocabIds = needsVocab && vocabItems.length > 0
        ? new Set(
            (await db
              .select({ vocabularyId: vocabularyLocalizations.vocabularyId })
              .from(vocabularyLocalizations)
              .where(and(
                eq(vocabularyLocalizations.languageCode, lang.code),
                inArray(vocabularyLocalizations.vocabularyId, vocabItems.map((v) => v.id)),
              ))).map((r) => r.vocabularyId),
          )
        : new Set<number>();

      const scenarioDone = !needsScenario || !!existingScenarioLoc;
      const vocabDone = !needsVocab || vocabItems.every((v) => existingVocabIds.has(v.id));

      if (scenarioDone && vocabDone) {
        console.log(`  [skip] "${sc.title}" already localized (${lang.code})`);
        continue;
      }

      processed++;

      try {
        const raw = await provider.generateJSON(buildPrompt(lang.name, lang.code, sc, vocabItems), []);
        const parsed = JSON.parse(raw) as GeneratedLocalization;

        const scenarioFields = parsed.scenario;
        if (scenarioFields && needsScenario) {
          await db.insert(scenarioLocalizations).values({
            scenarioId: sc.id,
            languageCode: lang.code,
            title: scenarioFields.title ?? null,
            context: scenarioFields.context ?? null,
            learningGoals: scenarioFields.learningGoals ?? null,
            aiCharacterName: scenarioFields.aiCharacterName ?? null,
            aiCharacterRole: scenarioFields.aiCharacterRole ?? null,
            userCharacterName: scenarioFields.userCharacterName ?? null,
            userCharacterRole: scenarioFields.userCharacterRole ?? null,
          }).onConflictDoNothing();
          // Invalidate the shared (Upstash) scenario cache immediately so the
          // API sees the fresh row even if a later vocab step fails.
          await cacheDel(cacheKeys.scenarioLocalization(sc.id, lang.code));
        }

        const genByOriginal = new Map<string, GeneratedVocabEntry>(
          (parsed.vocabulary ?? []).map((v) => [String(v.original ?? '').trim(), v]),
        );
        let matched = 0;
        const vocabInserts: Array<{
          vocabularyId: number;
          languageCode: string;
          translation: string;
          usageTip: string | null;
        }> = [];
        for (const [index, v] of vocabItems.entries()) {
          const gen = genByOriginal.get(v.targetText.trim()) ?? (parsed.vocabulary ?? [])[index];
          if (!gen?.targetText) continue;
          vocabInserts.push({
            vocabularyId: v.id,
            languageCode: lang.code,
            translation: gen.targetText,
            usageTip: gen.usageTip ?? null,
          });
          matched++;
        }

        if (vocabInserts.length > 0 && needsVocab) {
          await db.insert(vocabularyLocalizations).values(vocabInserts).onConflictDoNothing();
          // Invalidate the shared (Upstash) vocab cache immediately after the
          // write succeeds.
          await cacheDel(cacheKeys.vocabLocalizations(sc.id, lang.code));
        }
        totalInserted += vocabInserts.length;

        console.log(
          `  [ok] "${sc.title}" — scenario:${scenarioFields && needsScenario ? 'yes' : 'no'} vocab:${matched}/${vocabItems.length}`,
        );
      } catch (err) {
        console.warn(`  [ERR] "${sc.title}" (${lang.code}):`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  console.log(`\n=== Done. Upserted ${totalInserted} vocabulary localizations. ===`);
}

main().catch((err) => {
  console.error('Generator failed:', err);
  process.exit(1);
});
