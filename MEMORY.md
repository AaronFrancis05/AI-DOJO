# Memory — Multi-Language Pivot (§1–§9)

Last updated: 2026-07-23

## What was built

**§1 Schema migration** — Manual Drizzle migration `0016_multi_language_pivot.sql` with 6 column changes using RENAME COLUMN: `vocabulary.japanese`→`target_text`, `vocabulary.english`→`translation`, added `language_code`; `conversations.message_jp`/`message_en` dropped, `message_target` made NOT NULL; `scenario_goals.target_phrase_jp`→`target_phrase`, added `language_code`; `characters` added `gender`; `audio_jobs` added `voice_gender`; `sessions` added `avatar_enabled`. Journal, snapshot, and `src/schema.ts` all updated. 44 downstream references across 12 files fixed.

**§2 Language config** — `lib/language.ts` expanded with `LanguageConfig` (azureVoice: { female, male }, ttsSupported). `TARGET_LANGUAGES` includes en, ja, fr, lg. `resolveAzureVoice(bcp47, gender)` covers all 12 languages × 2 genders.

**§3 AI engine reprompt** — Both `analyzeAndGenerateTurn` and `analyzeUserTurn` in `lib/ai-engine.ts` rewritten from full-immersion to code-switching (native-language-primary). `messageTarget` = highlighted target phrases; `messageNative` = full utterance. Conversation history uses `messageNative ?? messageTarget`. `wrong_language` correction type removed.

**§4 Seed rewrite** — `src/seed.ts` made idempotent (checks for existing users before seeding).

**§5 Session UI** — `components/roleplay/VoiceOnlyStage.tsx` (SVG/CSS voice-orb fallback, 3 states: idle/listening/talking). Session page `app/(app)/session/[sessionId]/page.tsx` wires `avatarEnabled` to toggle between `AvatarViewport` and `VoiceOnlyStage`. User `AvatarViewport` removed.

**§6 Voice maps consolidation** — `lib/language.ts` now has complete `AZURE_VOICE_MAP` (all 12 native languages × female/male) and `resolveAzureVoice()`. All 3 hardcoded maps removed: `lib/roleplay/tts.ts`, `app/api/tts/route.ts`, `app/api/audio/process/route.ts`. `enqueueAudioJob` accepts optional `voiceGender`.

**§7 Gender selection UI** — Migration `0017_voice_gender.sql` adds `voice_gender` to `sessions` + `user_preferences` table. `app/api/user/preferences/route.ts` (GET/PUT). Settings page (`app/(app)/settings/page.tsx`) has feminine/masculine toggle with auto-save. Session creation (`app/api/sessions/route.ts`, `app/api/domains/create-custom/route.ts`) falls back to user preference. Session new page (`app/(app)/session/new/page.tsx`) has inline gender selector.

**§8 Character gender field** — `gender` added to `CharacterFixture` type and all 8 character objects in `lib/mock-data/characters.ts`. Seed script (`scripts/seed-domain-data.ts`) updated. Data adapter maps `gender`. Character selection cards show gender badge (pink ♀ / sky ♂).

**§9 Character editor gender picker** — `components/ui/GenderPicker.tsx` (reusable toggle). `app/api/characters/[id]/route.ts` (PATCH handler). Settings Avatar page "AI Voice Preferences" tab now shows inline GenderPicker per character with save-on-change.

## Decisions made

- **Don't touch `users` table** — all multi-language columns and preferences go on other tables or a new `user_preferences` table.
- **Code-switching, not immersion** — AI speaks primarily in the user's native language with embedded target-language phrases, matching the Ugandan learning context.
- **Avatar is opt-in** — `sessions.avatarEnabled` defaults to `false`. The `VoiceOnlyStage` SVG/CSS fallback is the default experience.
- **Azure Speech has no `lg-UG` locale** — Luganda falls back to en-US voices with `ttsSupported: false`.
- **Gender-aware TTS** — voice selection uses `resolveAzureVoice(bcp47, gender)` from `language.ts` as single source of truth. Session-level `voiceGender` defaults to `female`; user preference stored in `user_preferences` table.
- **Characters are seed data** — no character creation form exists. Gender is edited via the settings page AI Voice Preferences tab (inline `GenderPicker` + PATCH API).

## Problems solved

- Schema migration used data-preserving RENAME COLUMN instead of DROP/RECREATE to avoid data loss.
- AI engine reprompt required careful JSON schema update alongside prompt changes to avoid type mismatches.
- 44 downstream references fixed after column renames — caught by TypeScript strict mode.
- `enqueueAudioJob` needed `voiceGender` parameter threading through the stream route callers.
- Character type (`CharacterFixture`) was missing `gender` even though the DB column existed after §1 migration — added in §8.

## Current state

All 9 workstreams (§1–§9) are complete. The multi-language pivot is code-complete at the schema, engine, TTS, and UI levels. TypeScript compiles cleanly (`npx tsc --noEmit` passes).

**What works:**
- Schema supports multi-language (en, ja, fr, lg) with gender on characters and gender-aware TTS
- AI engine produces code-switched output (native-primary with embedded target phrases)
- Voice maps consolidate to a single `resolveAzureVoice()` source of truth
- Gender preference flows: settings → user_preferences table → session creation → TTS voice selection
- Character gender displayed in selection cards and editable in settings
- Avatar toggle works (AvatarViewport vs VoiceOnlyStage)

**Known gaps (not blocking):**
- Stream route (`app/api/chat/stream/route.ts`) accepts `voiceGender` but doesn't read character gender yet — defaults to user preference or 'female'
- `connected_accounts` and `session` tables in DB may reference old column names — not migrated
- Tests not run (no test framework configured for this project)
- Migration SQL not yet applied to production DB

## Next session starts with

Apply the pending migrations (0016, 0017) to the production database, or move on to post-pivot work (tests, deployment, additional languages).

## Open questions

- Should `voiceGender` on the stream route be derived from the selected character's gender rather than user preference?
- Do we need a character creation/edit page (currently characters are seed data only)?
- Should the `gender` display on character cards be hidden when gender data isn't available (backfill scenario)?
