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

      # Native-language explanations of the TARGET scene, per (target, native)
      # pair, into the *_native_* tables. --target defaults to English; every
      # enabled native language is covered unless --lang narrows it.
      npm run db:backfill-target-localizations -- --only=native
      npm run db:backfill-target-localizations -- --only=native --lang=ja --limit=2 --dry-run
      npm run db:backfill-target-localizations -- --only=native --target=fr --lang=en

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
  scenarioNativeLocalizations,
  situationNativeLocalizations,
  scenarioGoalNativeLocalizations,
  vocabulary,
  vocabularyLocalizations,
  vocabularyNativeNotes,
} from '../src/schema';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { TARGET_LANGUAGES, NATIVE_LANGUAGES, BASE_CONTENT_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from '../lib/language';
import { loadLanguageCatalog } from '../lib/language-registry';
import { getAIProvider, type AIProvider } from '../lib/ai-providers';
import { cacheDel, cacheKeys } from '../lib/cache';

// Target content: nothing to backfill for the base language itself. Native
// explanations (--only=native) do cover it — see runNativeBackfill.
const BASE_LANG = BASE_CONTENT_LANGUAGE;

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

function sanitizeGeneratedText(value: string | undefined): string | undefined {
  return value?.replace(/___/g, '').trim();
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

      parsed.title = sanitizeGeneratedText(parsed.title);
      parsed.context = sanitizeGeneratedText(parsed.context);
      parsed.learningGoals = sanitizeGeneratedText(parsed.learningGoals);
      parsed.aiCharacterName = sanitizeGeneratedText(parsed.aiCharacterName);
      parsed.aiCharacterRole = sanitizeGeneratedText(parsed.aiCharacterRole);
      parsed.userCharacterName = sanitizeGeneratedText(parsed.userCharacterName);
      parsed.userCharacterRole = sanitizeGeneratedText(parsed.userCharacterRole);

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

      parsed.title = sanitizeGeneratedText(parsed.title);
      parsed.context = sanitizeGeneratedText(parsed.context);
      parsed.learningGoals = sanitizeGeneratedText(parsed.learningGoals);
      parsed.focusPills = sanitizeGeneratedText(parsed.focusPills);

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

// ── --only=native: explanations for one (target, native) pair ──────────────
//
// Everything above writes TARGET content (the scene a learner of that language
// plays). This mode writes the text a speaker of each native language reads to
// understand that scene: scenario/situation/goal descriptions and a usage tip
// per word, keyed by (target, native) in the *_native_* tables. It translates
// the target scene's own text, so the explanation always matches what the AI
// plays — it never reimagines anything.
//
// One request per scenario covers its description, goals and word tips, so a
// full run is (#scenarios + #situations) × #native languages requests.

interface GeneratedNativeScenario {
  title?: string;
  context?: string;
  learningGoals?: string;
  aiCharacterRole?: string;
  userCharacterRole?: string;
  goals?: string[];
  vocabularyTips?: Array<{ id?: number; usageTip?: string }>;
}

function buildNativeScenarioPrompt(
  targetName: string,
  nativeName: string,
  nativeCode: string,
  scene: { title: string; context: string; learningGoals: string; aiCharacterRole: string; userCharacterRole: string },
  goals: Array<{ goalText: string; targetPhrase: string | null }>,
  words: Array<{ id: number; word: string; meaning: string; tip: string | null }>,
): string {
  const goalList = goals.map((g, i) => `${i + 1}. ${g.goalText}${g.targetPhrase ? ` (learner says: "${g.targetPhrase}")` : ''}`).join('\n');
  const wordList = words.map((w) => `- id ${w.id}: "${w.word}" = ${w.meaning}${w.tip ? ` (existing English tip: ${w.tip})` : ''}`).join('\n');
  return `You write the instructions a ${nativeName} (${nativeCode}) speaker reads while learning ${targetName} in a roleplay app.

Translate the scene description below into natural ${nativeName}. Translate faithfully — do not change the setting, the place names or what happens. Keep proper names as they are. Write for a learner: clear, warm, short sentences.

Scene:
Title: ${scene.title}
Context: ${scene.context}
Learning goals: ${scene.learningGoals}
AI character role: ${scene.aiCharacterRole}
Learner's role: ${scene.userCharacterRole}

Goals (exactly ${goals.length}, keep the order; translate the goal description only — never translate the quoted ${targetName} phrase):
${goalList || '(none)'}

Words the learner practises (exactly ${words.length}). For each, write ONE usage tip in ${nativeName} for a ${nativeName} speaker using this ${targetName} word: when to use it, register/politeness, and the mistake a ${nativeName} speaker typically makes with it (false friends, word order, pronunciation). Quote the ${targetName} word itself unchanged.
${wordList || '(none)'}

Return strictly a JSON object (no markdown, no code fences):
{
  "title": "...",
  "context": "...",
  "learningGoals": "...",
  "aiCharacterRole": "...",
  "userCharacterRole": "...",
  "goals": ["... exactly ${goals.length} strings, same order ..."],
  "vocabularyTips": [{"id": 123, "usageTip": "..."}]
}
Write every value in ${nativeName}. CRITICAL: never output "___" or bracketed placeholders.`;
}

function buildNativeSituationPrompt(
  targetName: string,
  nativeName: string,
  nativeCode: string,
  st: { title: string; context: string; learningGoals: string; focusPills: string },
): string {
  return `You write the instructions a ${nativeName} (${nativeCode}) speaker reads while learning ${targetName} in a roleplay app.

Translate this situation description faithfully into natural ${nativeName}. Do not change the setting or what happens; keep proper names as they are.

Title: ${st.title}
Context: ${st.context}
Learning goals: ${st.learningGoals}
Focus pills ("|||"-delimited): ${st.focusPills}

Return strictly a JSON object (no markdown, no code fences):
{"title": "...", "context": "...", "learningGoals": "...", "focusPills": "... same '|||'-delimited format and count ..."}
Write every value in ${nativeName}. CRITICAL: never output "___" or bracketed placeholders.`;
}

async function backfillNativeScenarios(
  provider: AIProvider,
  targetCode: string,
  targetName: string,
  nativeCode: string,
  nativeName: string,
  limit: number | null,
  dryRun: boolean,
): Promise<{ processed: number; written: number }> {
  const scenarioRows = await db.select().from(scenarios).orderBy(scenarios.id);
  const done = new Set((await db
    .select({ scenarioId: scenarioNativeLocalizations.scenarioId })
    .from(scenarioNativeLocalizations)
    .where(and(
      eq(scenarioNativeLocalizations.targetLanguage, targetCode),
      eq(scenarioNativeLocalizations.nativeLanguage, nativeCode),
    ))).map((r) => r.scenarioId));

  let processed = 0;
  let written = 0;
  for (const sc of scenarioRows) {
    if (done.has(sc.id)) continue;
    if (limit != null && processed >= limit) break;
    processed++;

    try {
      const isBaseTarget = targetCode === BASE_LANG;
      const [scLoc] = isBaseTarget ? [] : await db
        .select()
        .from(scenarioLocalizations)
        .where(and(eq(scenarioLocalizations.scenarioId, sc.id), eq(scenarioLocalizations.languageCode, targetCode)))
        .limit(1);
      const goals = await db.select().from(scenarioGoals)
        .where(eq(scenarioGoals.scenarioId, sc.id)).orderBy(asc(scenarioGoals.sequenceOrder));
      const goalLocs = isBaseTarget || goals.length === 0 ? [] : await db.select().from(scenarioGoalLocalizations)
        .where(and(
          inArray(scenarioGoalLocalizations.scenarioGoalId, goals.map((g) => g.id)),
          eq(scenarioGoalLocalizations.languageCode, targetCode),
        ));
      const goalLocById = new Map(goalLocs.map((g) => [g.scenarioGoalId, g]));
      const vocabRows = await db.select().from(vocabulary)
        .where(and(eq(vocabulary.scenarioId, sc.id), eq(vocabulary.languageCode, BASE_LANG)))
        .orderBy(asc(vocabulary.id));
      const vocabLocs = isBaseTarget || vocabRows.length === 0 ? [] : await db.select().from(vocabularyLocalizations)
        .where(and(
          inArray(vocabularyLocalizations.vocabularyId, vocabRows.map((v) => v.id)),
          eq(vocabularyLocalizations.languageCode, targetCode),
        ));
      const vocabLocById = new Map(vocabLocs.map((v) => [v.vocabularyId, v]));

      // The target scene — the same layering the session route applies.
      const scene = {
        title: scLoc?.title ?? sc.title,
        context: scLoc?.context ?? sc.context,
        learningGoals: scLoc?.learningGoals ?? sc.learningGoals,
        aiCharacterRole: scLoc?.aiCharacterRole ?? sc.aiCharacterRole,
        userCharacterRole: scLoc?.userCharacterRole ?? sc.userCharacterRole,
      };
      const sceneGoals = goals.map((g) => ({
        goalText: goalLocById.get(g.id)?.goalText ?? g.goalText,
        targetPhrase: goalLocById.get(g.id)?.targetPhrase ?? g.targetPhrase,
      }));
      const words = vocabRows.map((v) => {
        const loc = vocabLocById.get(v.id);
        return {
          id: v.id,
          word: loc?.translation ?? (targetCode === 'en' ? v.translation : v.targetText),
          meaning: v.translation,
          tip: loc?.usageTip ?? v.usageTip,
        };
      });

      const raw = await provider.generateJSON(
        buildNativeScenarioPrompt(targetName, nativeName, nativeCode, scene, sceneGoals, words), [],
      );
      const parsed = JSON.parse(raw) as GeneratedNativeScenario;
      if (dryRun) {
        console.log(`  [dry-run] scenario "${sc.title}" (${targetCode}→${nativeCode}):`, JSON.stringify(parsed, null, 2));
        continue;
      }

      await db.insert(scenarioNativeLocalizations).values({
        scenarioId: sc.id,
        targetLanguage: targetCode,
        nativeLanguage: nativeCode,
        title: sanitizeGeneratedText(parsed.title)?.slice(0, 120) ?? null,
        context: sanitizeGeneratedText(parsed.context) ?? null,
        learningGoals: sanitizeGeneratedText(parsed.learningGoals) ?? null,
        aiCharacterRole: sanitizeGeneratedText(parsed.aiCharacterRole)?.slice(0, 150) ?? null,
        userCharacterRole: sanitizeGeneratedText(parsed.userCharacterRole)?.slice(0, 150) ?? null,
      }).onConflictDoNothing();

      // Goals are matched by position; a count mismatch means the model lost
      // the order, and a shifted goal list is worse than an English one.
      const goalTexts = Array.isArray(parsed.goals) ? parsed.goals : [];
      if (goals.length > 0 && goalTexts.length === goals.length) {
        await db.insert(scenarioGoalNativeLocalizations).values(goals.map((g, i) => ({
          scenarioGoalId: g.id,
          targetLanguage: targetCode,
          nativeLanguage: nativeCode,
          goalText: sanitizeGeneratedText(goalTexts[i]) ?? null,
        }))).onConflictDoNothing();
      } else if (goals.length > 0) {
        console.warn(`  [WARN] scenario "${sc.title}": expected ${goals.length} goal(s), got ${goalTexts.length} — goals skipped`);
      }

      // Tips are matched by id, so a dropped or reordered tip only loses itself.
      const validIds = new Set(vocabRows.map((v) => v.id));
      const tips = (Array.isArray(parsed.vocabularyTips) ? parsed.vocabularyTips : [])
        .filter((t) => typeof t.id === 'number' && validIds.has(t.id) && t.usageTip);
      if (tips.length > 0) {
        await db.insert(vocabularyNativeNotes).values(tips.map((t) => ({
          vocabularyId: t.id!,
          targetLanguage: targetCode,
          nativeLanguage: nativeCode,
          usageTip: sanitizeGeneratedText(t.usageTip) ?? null,
        }))).onConflictDoNothing();
      }

      await Promise.all([
        cacheDel(cacheKeys.scenarioNativeLocalization(sc.id, targetCode, nativeCode)),
        cacheDel(cacheKeys.goalNativeLocalizations(sc.id, targetCode, nativeCode)),
        cacheDel(cacheKeys.vocabNativeNotes(sc.id, targetCode, nativeCode)),
      ]);
      written++;
      console.log(`  [ok] scenario "${sc.title}" (${targetCode}→${nativeCode}): ${goalTexts.length} goal(s), ${tips.length}/${vocabRows.length} tip(s)`);
    } catch (err) {
      console.warn(`  [ERR] scenario "${sc.title}" (${targetCode}→${nativeCode}):`, err instanceof Error ? err.message : String(err));
    }
  }
  return { processed, written };
}

async function backfillNativeSituations(
  provider: AIProvider,
  targetCode: string,
  targetName: string,
  nativeCode: string,
  nativeName: string,
  limit: number | null,
  dryRun: boolean,
): Promise<{ processed: number; written: number }> {
  const situationRows = await db.select().from(situations).orderBy(situations.id);
  const done = new Set((await db
    .select({ situationId: situationNativeLocalizations.situationId })
    .from(situationNativeLocalizations)
    .where(and(
      eq(situationNativeLocalizations.targetLanguage, targetCode),
      eq(situationNativeLocalizations.nativeLanguage, nativeCode),
    ))).map((r) => r.situationId));

  let processed = 0;
  let written = 0;
  for (const st of situationRows) {
    if (done.has(st.id)) continue;
    if (limit != null && processed >= limit) break;
    processed++;

    try {
      const [stLoc] = targetCode === BASE_LANG ? [] : await db
        .select()
        .from(situationLocalizations)
        .where(and(eq(situationLocalizations.situationId, st.id), eq(situationLocalizations.languageCode, targetCode)))
        .limit(1);
      const scene = {
        title: stLoc?.title ?? st.title,
        context: stLoc?.context ?? st.context ?? '',
        learningGoals: stLoc?.learningGoals ?? st.learningGoals ?? '',
        focusPills: stLoc?.focusPills ?? st.focusPills ?? '',
      };
      const raw = await provider.generateJSON(buildNativeSituationPrompt(targetName, nativeName, nativeCode, scene), []);
      const parsed = JSON.parse(raw) as GeneratedSituation;
      if (dryRun) {
        console.log(`  [dry-run] situation "${st.title}" (${targetCode}→${nativeCode}):`, JSON.stringify(parsed, null, 2));
        continue;
      }
      await db.insert(situationNativeLocalizations).values({
        situationId: st.id,
        targetLanguage: targetCode,
        nativeLanguage: nativeCode,
        title: sanitizeGeneratedText(parsed.title)?.slice(0, 120) ?? null,
        context: sanitizeGeneratedText(parsed.context) ?? null,
        learningGoals: sanitizeGeneratedText(parsed.learningGoals) ?? null,
        focusPills: sanitizeGeneratedText(parsed.focusPills) ?? null,
      }).onConflictDoNothing();
      await cacheDel(cacheKeys.situationNativeLocalization(st.id, targetCode, nativeCode));
      written++;
      console.log(`  [ok] situation "${st.title}" (${targetCode}→${nativeCode}) -> "${parsed.title}"`);
    } catch (err) {
      console.warn(`  [ERR] situation "${st.title}" (${targetCode}→${nativeCode}):`, err instanceof Error ? err.message : String(err));
    }
  }
  return { processed, written };
}

async function runNativeBackfill(
  provider: AIProvider,
  langFilter: string | null,
  limit: number | null,
  dryRun: boolean,
): Promise<void> {
  const targetCode = parseArg('target') ?? DEFAULT_TARGET_LANGUAGE;
  const target = TARGET_LANGUAGES.find((l) => l.code === targetCode);
  if (!target) throw new Error(`Unknown --target=${targetCode}`);
  // Every native language, the base content language included — Japanese
  // speakers need explanations of the English scenes as much as anyone.
  const natives = NATIVE_LANGUAGES.filter((l) => l.code !== targetCode && (!langFilter || l.code === langFilter));
  if (natives.length === 0) {
    console.log('No matching native languages to backfill.');
    return;
  }

  let scenariosWritten = 0;
  let situationsWritten = 0;
  for (const native of natives) {
    console.log(`\n=== ${target.name} explained in ${native.name} (${target.code}→${native.code}) ===`);
    console.log(' Scenarios (with goals and word tips):');
    scenariosWritten += (await backfillNativeScenarios(provider, target.code, target.name, native.code, native.name, limit, dryRun)).written;
    console.log(' Situations:');
    situationsWritten += (await backfillNativeSituations(provider, target.code, target.name, native.code, native.name, limit, dryRun)).written;
  }
  console.log(`\n=== Done. Wrote ${scenariosWritten} scenario and ${situationsWritten} situation explanation(s). ===`);
}

async function main(): Promise<void> {
  // Hydrates lib/language.ts from the `languages` table, so this script covers
  // languages an admin added as well as the compiled-in ones. Without it the
  // module-level constants are all a CLI process ever sees.
  await loadLanguageCatalog();

  const langFilter = parseArg('lang');
  const only = parseArg('only'); // 'scenarios' | 'situations' | 'goals' | 'native' | null (all target content)
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

  if (only === 'native') {
    await runNativeBackfill(provider, langFilter, limit, dryRun);
    return;
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
