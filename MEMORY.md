# Project Memory

## 2026-08-16

- AI DOJO voice chat: fixed "Objects are not valid as a React child" by rendering `goal.goalText` instead of `{goal}` and comparing `goal.sequenceOrder` instead of the full object in `voice/page.tsx`.
- Deleted remote branch `origin/dev2` (`git push origin --delete dev2`).
- Voice UI polish: orb volume meter, status pill, token-based light/dark colors, real `skillLevel` and `userCharacterRole`, functional chat filter tabs (All/Key Phrases/Notes), suggested replies replaced dead buttons.
- Conversation chat moved OUT of the central stage (orb + mic area) into a left slide-out panel toggled by the "Show Chat" button; caption bubble removed from `VoiceOnlyStage.tsx`.
- `/remember`, `/recover`, and `/agents/remember` are not built-in opencode commands; created a custom `remember` subagent at `~/.config/opencode/agents/remember.md` so `/agents/remember <note>` saves to `MEMORY.md`.
- Working repo: this repository (`AI-DOJO`), branch `dev`.
## 2026-08-22

- Target-language localization backfill COMPLETE. New situation_localizations table (migration drizzle/0031_tan_swordsman.sql; 
pm run db:migrate is broken by a stale backlog failing at 0002 - EMERGENCY-ONLY workaround (after backup + schema verification + rollback plan): execute the single migration's SQL directly and record its hash/when from drizzle/meta/_journal.json into drizzle.__drizzle_migrations; do not treat this as the default path - journal reconciliation is pending deliberate work). Code: situationLocalizations in src/schema.ts; getTargetSituationLocalization/pplySituationLocalization in lib/localization.ts + cache key in lib/cache.ts; wired into lib/roleplay/analyze-turn.ts; TARGET_LANG_NAMES/NATIVE now derived from TARGET_LANGUAGES in lib/ai-engine.ts.
- Backfill script: scripts/backfill-target-localizations.ts (
pm run db:backfill-target-localizations, flags --lang= --limit= --only= --dry-run). Culturally reimagines (not translates) all 41 scenarios + 64 situations per target language via Gemini flash-lite; idempotent (skips existing rows). Final DB state: 30/30 target languages at 41/41 scenarios and 64/64 situations = 3,150 rows, plus 2,160 vocabulary_localizations (72 items x 30 langs) and 10 legacy `ne` scenario rows = 1,240 scenario_localizations total (5,320 localization rows overall). Note: th
e scenario_localizations 10/41 rows are legacy for a NATIVE-UI language, out of scope. Transient Gemini JSON-truncation failures on km/my were cleared by idempotent reruns.

## 2026-08-22 (localization fixture seeding)

- Fresh-database localization coverage: 
pm run db:export-localizations (scripts/export-localizations.ts) snapshots scenario/situation/vocabulary localizations from the live DB into committed fixture src/data/localizations.json (5,320 rows ~3.3MB). Rows keyed by business keys (scenario title; domainSlug+situation title; scenario title+targetText), NOT numeric ids - serial ids diverge between environments.
- src/seed.ts section 5b replays the fixture idempotently after base rows: resolves parents by key, filters already-present (parent, lang) pairs, chunked inserts (200/batch) with onConflictDoNothing + .returning() for true inserted counts; entries whose parents are not seeded yet are skipped with logged counts (re-run seed after migrate-legacy-scenarios.ts / scripts/seed-domain-data.ts).
- db:backfill-target-localizations stays the regeneration path for NEW content/languages; re-export fixture afterwards and commit the diff.
- PRE-EXISTING BUG FOUND+FIXED in data: vocabulary table had 89 duplicate base rows (203 rows / 114 distinct scenario+targetText) - repeated seed runs created them and their localizations split across twin ids (uq_vocabulary_localizations_key never fired). Deduped keeping the id holding localizations (lowest-id tiebreak); DB now 114 vocab rows, 2160 vocab_localizations, zero dupes. The seed.ts vocabulary dedupe filter that allowed this was NOT changed (flagged for follow-up).

## 2026-08-22 (DB health audit + seed vocab bug fix)

- DB health audit: 35/35 tables present matching src/schema.ts; localization coverage complete (30 target langs x 41 scenarios + 64 situations; scenario_localizations also holds 10 legacy 
e rows = 1240 total); zero orphan localizations, zero duplicate business keys, users intact (17 users / 6 with password).
- FIXED root cause of recurring vocabulary duplicates: src/seed.ts missingVocabulary filter compared e.languageCode === v.languageCode but seedVocabulary literals have no languageCode field (schema defaults 'ja'), so every item was judged missing on EVERY seed run and re-inserted (~89 dupes per historical run). Filter now compares against (v.languageCode ?? 'ja'). Verified: two consecutive db:seed runs leave vocabulary at exactly 114 rows / 2160 vocab_localizations.
- Migration bookkeeping debt (known, NOT fixed): drizzle.__drizzle_migrations records only 4 entries vs repo journal's 31; 
pm run db:migrate fails at 0002 (stale backlog, schema already applied out-of-band historically). Schema reality matches code. Reconciling the journal is a careful production task - do NOT blindly re-run migrations.

## 2026-08-22 (scenario goal localization)

- Fixed: scenarioGoals.targetPhrase (the exact phrase the AI elicits each turn) was always Japanese - loadSessionTurnData loaded goals without any language filter, so non-JP sessions had the AI instructing literal Japanese phrases mid-conversation.
- New table scenario_goal_localizations (migration drizzle/0032_peaceful_quicksilver.sql, applied via emergency-only manual journal path). lib/localization.ts: getTargetGoalLocalizations (batch per scenarioId, cached per (scenarioId,lang) under cacheKeys.goalLocalizations) + applyGoalLocalization. Wired into loadSessionTurnData after goals query with per-goal missing warning pointing at --only=goals rerun.
- Backfill script gained a goals branch (--only=goals): one LLM call per scenario x language for its whole goal set, prompted with that language's already-reimagined scenario localization so targetPhrases fit the reimagined scene (not literal JP translations). Full coverage: 98 goals x 30 langs = 2,940 rows; lg/bn/my transient JSON-truncation failures cleared by idempotent reruns.
- Fixture pipeline extended end-to-end: export-localizations.ts emits scenarioGoalLocalizations keyed by (scenarioTitle, sequenceOrder); src/seed.ts section 5b replays it like the other three arrays. Fixture now 8,260 rows / ~4.4MB. Seed re-run verified as true no-op on this DB.
- Phonetic note (investigated, intentionally unchanged): stream route's showPhonetic hardcodes ja-only because the base vocabulary.phonetic column stores JA romaji and vocabulary_localizations has no phonetic field - enabling ko/etc phonetics needs a localized-phonetic column first. The reported romanized-Korean artifact should resolve via goal localization itself.
