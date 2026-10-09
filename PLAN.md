# AI-DOJO → "AI + Ugandan Tutor" English service: audit, fixes, and build plan

## Context

Proposal 1 asks whether AI-DOJO, combining AI teachers with Ugandan English tutors, can become a differentiated English-learning service for non-English-speaking regions, and how to build it.

The read-through (three code audits plus tsc, lint and tests) found three things:

1. **The engine is ready.**
   - English is already a target language (`lib/language.ts:55`).
   - Role-play, scoring, SRS, the adaptive Gemini Live examiner (`lib/interview/`), tutor profiles, timezone-correct availability, bookings, group live lessons, Stream video, translated chat and B2B organizations all exist.
2. **The business layer is missing.**
   - No payments: `BillingDialog.tsx:24` says "free… Coming Soon".
   - No tutor payouts, ratings, CEFR placement, UI localization or RTL support.
   - No learner-specific generated content: every AI path writes to shared catalogue tables.
3. **The product is tuned for the wrong direction.**
   - The base content is Japanese words with English meanings, and defaults are `target='ja', native='en'` (`src/schema.ts:27-28`).
   - Japanese learners of English get no Japanese-language explanations, because no `ja` native rows exist and `lib/localization.ts:186-236` falls back to English.
   - Japan is the most obvious first market, and these learners are served worst today.

Baseline health: `npm run lint` is clean, `npm test` passes 182/182, and the source type-checks; the only tsc errors come from stale `.next/types`. The engineering audit also found real defects that must be fixed before any paid launch. The most serious is a database backup committed to GitHub containing user emails and bcrypt hashes.

### Differentiation (the answer to "can we stand out?")

Competitors split into AI-only apps (Duolingo Max, Speak, Praktika) and human-only marketplaces (Cambly, Preply, italki). AI-DOJO can credibly own the **hybrid loop**:

> **Practice with AI → AI diagnoses weak points → a Ugandan tutor receives a briefing and teaches exactly those → the AI generates homework from the lesson → re-practice.**

- **Price:** Ugandan tutor rates are well below those of US or UK tutors, and the AI takes the repetitive drill work, so tutor minutes go only to high-value work.
- **Scenario role-play is the core:** realistic job, travel and business scenes rather than flashcards. This product already has it (PRODUCT.md positioning).
- **AI-vs-human score calibration** (`tutor_evaluations.agreesWithAi`) is unusual. Market it as "your score is verified by a human."
- **B2B:** organizations, groups and tutor whitelists already exist, so Japanese and Korean companies and universities can buy seats.
- **Risk to address in messaging:** the "native speaker" bias in Asian markets. Counter it with CEFR-certified tutor vetting, an accent-neutral pronunciation rubric, and outcome data (score gains).

---

## Phase 0: Stop-ship fixes (security and correctness)

| # | Issue | Fix |
|---|---|---|
| 0.1 | `backups/backup-2026-07-04…json` is committed. It holds emails, bcrypt hashes and share tokens, and the GitHub remote is AkademiaLimited/AI-DOJO. | `git rm --cached -r backups/`, add `backups/` to `.gitignore`, purge it from history with `git filter-repo` (coordinate with the team, since this rewrites history), and rotate the share tokens and the affected users' passwords. |
| 0.2 | `lib/tryout/gate.ts:136` trusts the first `x-forwarded-for` value, so every per-IP limit can be spoofed. | Use the last proxy-appended hop or the platform IP header. |
| 0.3 | `app/api/speech/token/route.ts:11` issues guest Azure tokens through a non-atomic limiter that fails open. | Use `rateLimitIncrement`, deny when it returns null, and fail closed in production. The same fail-closed rule applies to `onboarding/turn` and `tryout/turn`. |
| 0.4 | `app/api/chat/stream/route.ts:82` has no input cap and no per-user rate limit, and trusts the `accuracyScore` sent by the client. | Cap input at about 1,000 characters, add a per-user `rateLimitIncrement`, and stop trusting client scores. |
| 0.5 | `app/api/tryout/turn/route.ts:102` lets the client supply unbounded history, including fake AI turns. | Cap turns and characters. |
| 0.6 | `lib/cache.ts:80` runs `INCR` and `EXPIRE` separately, so a key can be left with no expiry. | Use a `multi()` pipeline. |
| 0.7 | `lib/exportAuth.ts:13` compares the API key in non-constant time. | Use `crypto.timingSafeEqual`. |
| 0.8 | Stale `.next/types` causes 18 tsc errors. | Delete `.next/` before running `tsc`. Not a source bug. |

## Phase 1: Performance and refinement

- **1.1 Foreign-key indexes** in `src/schema.ts`, then `npm run db:generate`. The columns are `sessions.userId`, `conversations.sessionId`, `corrections.conversationId`, `evaluations.userId`, `goalCompletions.sessionId`, `vocabularyEncounters.sessionId`, `chatMessages(roomId, createdAt)`, `vocabulary.scenarioId` and `scenarioGoals.scenarioId`. Apply through the fixed `db:migrate` (see the memory note on watermark bugs).
- **1.2 `lib/auth/sync-user.ts:78`:** only write when a field changed, and cache the auth-id → user-id mapping with `cacheGet`/`cacheSet`.
- **1.3 `scripts/db-migrate.ts`:** wrap each migration file in a transaction and make the statement splitter quote-aware.
- **1.4 N+1 and unbounded queries:**
  - `share/[token]`: one `inArray` query, as `sessions/[id]/route.ts:182` does, and add `expiresAt`.
  - `sessions` GET: add pagination and validate the scenario id.
  - `leaderboard`: use `computeCompositeScore`, filter out inactive users and non-learners, and cache for 60 seconds.
- **1.5 Bundle size:** load `AvatarViewport3D` with `next/dynamic` and `ssr:false` in `OnboardingPractice.tsx`, the avatar pages and `WelcomeBanner` (home page). Home should show a static thumbnail until the user interacts.
- **1.6 Dead code and fakes:**
  - Delete `/api/chat`, `analyzeAndGenerateTurn`, `lib/test-ai.ts` and `RoleplayInputBar.tsx`. This resolves the duplicated prompt in `ai-engine.ts`.
  - Replace or flag off the mock fixtures in `lib/data/sessions.ts:190-218`, which make the leaderboard Friends and School tabs fake.
- **1.7 Booking:** add a learner-side exclusion constraint so a learner cannot book two tutors at the same time, with an overlap pre-check before migrating.
- **1.8 Repo hygiene:** untrack `fbx2gltf.exe`, the `.fbx` sources, the duplicate `sunset.hdr` and `dev-log.txt`, and move large media to Git LFS or a CDN.
- **1.9 `review/due`:** apply target-language localization. It currently returns the base Japanese text.

## Phase 2: English-first product pivot (make the product correct for this market)

**Decision: serve all nations.** Every step below covers **every enabled native language** in `NATIVE_LANGUAGES` (`lib/language.ts:367`, about 32), not a shortlist of launch markets.

Each audit finding below has a numbered fix.

### 2.1 Defaults still point at a Japanese-learning product
Problem: `src/schema.ts:27-28` defaults to `ja`/`en`, and the progress rows at `:514-515` and `:539` do the same.

- **Code:** add `DEFAULT_TARGET_LANGUAGE = 'en'` to `lib/language.ts` as the one place that defines the default.
- **Schema:** change `users.preferredTargetLanguage`, `studentProgress.targetLanguage` and `studentLessonProgress.targetLanguage` to default to `'en'`.
  - `users.nativeLanguage` keeps its `'en'` column default, as a technical fallback only.
  - The migration comes from `db:generate`. It changes column defaults only; existing rows are untouched.
- **Inferring the native language before sign-up:**
  - The first fallback is the browser's `Accept-Language`, matched against `NATIVE_LANGUAGES`.
  - The second is `countries.defaultNativeLanguage`. The onboarding route already does this when a country is given (`app/api/user/onboarding/route.ts:35`).
- **Remove hard-coded `'ja'`/`'en'` from code paths.** Grep `'ja'` across `app/` and `lib/` and route every default through the constants. `lib/ai-engine.ts` and `lib/roleplay/analyze-turn.ts` mention Japanese 7 and 10 times; make each one conditional on the target language or delete it.

### 2.2 Only the content is localized, and the fallback is always English
Problem: `DEFAULT_NATIVE_LANGUAGE = 'en'` at `lib/localization.ts:6`. The base vocabulary is Japanese words with English meanings.

- **Show meanings in the learner's own language, using existing data.**
  - Add one resolver in `lib/localization.ts`: `resolveNativeGloss(vocabId, nativeLang)`.
  - When the native language is `ja`, the meaning is the base `vocabulary.targetText`, because the base word is already Japanese.
  - When the native language is `en`, the meaning is `vocabulary.translation`.
  - For any other language X, the meaning is `vocabularyLocalizations[X].translation`.
  - Wire it into `app/api/sessions/[id]/route.ts:215-226` and `review/due`. This gives meanings for about 31 languages with **no new generation**.
- **Usage tips in the learner's language.**
  - Add a `nativeUsageTip` column to `vocabulary_localizations`, keyed by the (target, native) pair. One option is a new `vocab_native_notes` table keyed by (vocabId, targetLang, nativeLang).
  - Fill it for target `en` × every native language with a new `--only=native-notes` branch in `scripts/backfill-target-localizations.ts`.
  - Fix the overwrite at `lib/localization.ts:233`, which replaces the learner's usage tip with the English one.
- **Fallback chain:** native language → English → base, with a logged "missing localization" warning, like the existing per-goal warning. A learner never silently gets a mixed-language screen.
- **Scenario settings:** the base scenarios are set in Japan ("Konbini"). For target `en`, use the existing `en` target-localization rows (already re-set in English-speaking places) as the scene, so the course is about "English in the world", not Japan.

### 2.3 Japanese speakers have no rows at all
Problem: `ja` is the base language, so it was never generated as a *native* (explanation) language.

- Generate `ja` rows for the native-facing text: scenario title, context and goals in `scenarioLocalizations`, plus `situationLocalizations` and `scenarioGoalLocalizations`.
  - Use the existing backfill script with `--lang=ja`, after removing the guard that skips `ja` because it is the base language.
  - The vocab meanings for `ja` come free from 2.2.
- Then run the same pass for **every other native language that has no rows**. `npm run db:check-localization` is extended to report coverage per (native × table), and it gates the release.
- Re-export the fixture: `db:export-localizations` writes `src/data/localizations.json`.

### 2.4 The UI itself is not localized
Problem: no i18n, `lang="en"` hard-coded at `app/layout.tsx:70`, no RTL, and hard-coded strings such as `TutorConsole.tsx:727-733`.

**Infrastructure.** Use one approach: `next-intl`, or a small in-house helper. This is the only new pattern, and it needs explicit agreement per AGENTS.md.
- Message catalogs live in `messages/<lang>.json`, with `en.json` as the source of truth.
- Server components call `getTranslations()`; client components call a `useT()` hook.
- **Extend** `lib/language-context.tsx`, which already carries the language catalogue to the client, to also carry the active UI locale and messages, rather than creating a second provider.

**Locale resolution**, in order:
1. the logged-in user's `nativeLanguage`;
2. a `ui-locale` cookie set by a new language switcher (in the header and Settings);
3. `Accept-Language`;
4. `en`.

**Layout.** `app/layout.tsx` sets `<html lang={locale} dir={rtl ? 'rtl' : 'ltr'}>`.
- RTL languages are listed by an `rtl: true` flag on `NativeLanguage` in `lib/language.ts`.
- Audit Tailwind's directional classes (`ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`) and move them to logical ones (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`).

**String extraction, in waves:**
1. Learner shell: onboarding, auth, home, session chrome, review and progress.
2. Marketing and tryout pages.
3. The tutor console (`TutorConsole.tsx`), the organization console, and settings.
4. Admin (may stay English).

**Formatting:** dates, times, numbers and currency use `Intl.*` with the active locale (one helper), including tutor prices in the learner's currency.

**Translation pipeline:**
- A new script, `scripts/translate-ui-messages.ts`, uses `getAIProvider().generateJSON` to translate `en.json` into every enabled native language. Idempotent: only missing or changed keys.
- Human review applies to the highest-traffic languages.
- A CI check fails when any key is missing from `en.json` or a catalog has keys `en.json` doesn't.

**Show the site in the visitor's language automatically, on the first visit.**
- **Pick the language from the visitor's country.** Middleware (`proxy.ts`) reads the hosting platform's country header (`cf-ipcountry`, `x-vercel-ip-country`, or a GeoIP lookup behind the Docker/nginx deploy) and maps it through `countries.defaultNativeLanguage`.
  - Where a country has several languages (Switzerland, India, Canada), the browser's `Accept-Language` decides between them.
  - The site switches on the first visit and shows a small "Viewing in 日本語 · change" notice. Whatever the visitor picks is saved in the `ui-locale` cookie and overrides the guess from then on.
- **Translate dynamic text on demand.** Some text isn't in the translation files: tutor bios, live-lesson titles and descriptions, announcements, org messages.
  - It is translated when first viewed, through `lib/ugajapa.ts`, which already does chat translation, with `getAIProvider()` as the fallback.
  - The result is cached with `cacheGet`/`cacheSet` and keyed by (text hash, language), so each text is paid for once.
  - The original text is always one tap away.
- **Never translate the English being taught.**
  - Every target-language span in the UI is marked `translate="no"`: lesson phrases, role-play bubbles, flashcards. Otherwise the in-app translation, or the browser's own Google/Edge translate, would turn the English lesson into Japanese.
  - This is also why the plan uses its own translation files rather than relying on the browser translating the page. Browser translation also breaks React's page loading and mistranslates learning content.

**SEO:** add locale-prefixed marketing routes (`/ja`, `/ko`, …) with `hreflang`, so the public site can rank in non-English markets. Logged-in app routes stay unprefixed and use the cookie or profile.

### 2.5 English language pack
  - Extend `lib/language-packs` with the English difficulty rubric, a register/politeness rubric for business English, and pronunciation targets for typical L1 errors (Japanese r/l, Spanish vowel insertion, Arabic p/b).
  - Expose the phoneme-level results that `assessPronunciation` (`lib/roleplay/pronunciation.ts:850`) currently throws away.
### 2.6 English-specific scenarios
Job interviews, offshore stand-ups, customer support, IELTS/TOEIC speaking and travel, written culture-neutral. Seed them through `src/seed.ts`'s idempotent pattern, then run 2.2 and 2.3 for them.

## Phase 3: Personalized learning materials (the AI-Dojo expansion)

The building blocks found by the audit are `getAIProvider().generateJSON`, the vocab-gen validation (`analyze-turn.ts:104`), `corrections` and `vocabularyEncounters`, `srsCards` with SM-2, `calendarTasks`, `createNotification`, `resolveDifficulty` and the Inngest cron pattern.

- **3.1 Learner weak-point model.** Add a `learner_weak_points` table: userId, category (an enum normalizing `correctionType` to grammar / vocab / pronunciation / register), pattern, example, count, lastSeen and resolvedAt. Fill it from the `corrections` rows after each session.
- **3.2 Post-session Inngest job.**
  - Send a `session/completed` event from the completion transaction (around line 833 of `chat/stream/route.ts`).
  - The new function `lib/inngest/functions/generateStudyPack.ts` does three things:
    - it updates weak points;
    - it calls `generateJSON` to produce a **study pack**: an explanation in the native language, 5 corrected-sentence drills, 3 mini dialogues using the weak patterns, and a next-scenario recommendation;
    - it stores the pack, creates SRS cards, and adds a calendar task and a notification.
- **3.3 Learner-owned content tables.** Add `study_packs` and `study_pack_items` (with userId, so they are never shared catalogue rows). Generalize `srsCards` with `cardType` (vocab | sentence | grammar) and a nullable `vocabularyId` plus a `payload` jsonb.
- **3.4 Personalized scenario generation.**
  - Add `interests` and `occupation` to the onboarding profile (`lib/onboarding/steps.ts`).
  - Generate learner-owned scenarios, using the `ownerUserId` approach already noted in `domains/create-custom/route.ts:49-62` and reusing its prompt and `parseGeneratedVocab`.
- **3.5 Wire up the existing quick drills:** connect `QuickExchangeDrill.tsx` (built but never imported) to the study pack.
- **3.6 AI cost control:**
  - Add per-call `model` and `maxTokens` options to `lib/ai-providers` types. Batch generation uses a cheap model; live turns use the fast one.
  - Add a `ai_usage` ledger (userId, tokens, cost, route) to enforce per-tier quotas.

## Phase 4: Human-tutor hybrid layer

- **4.1 Pre-lesson briefing:**
  - A new `app/api/tutor/learners/[id]/briefing` route returns the top weak points, the last 3 session scores with key corrections, CEFR level and the study-pack status.
  - Show it in a TutorConsole tab. Access requires a booking with that tutor (ownership check).
- **4.2 Post-lesson loop:** the tutor writes lesson notes, which feed into `generateStudyPack` as extra input. The AI then turns the human lesson into homework.
- **4.3 CEFR placement test:**
  - Run `lib/interview` as a standalone onboarding step.
  - Add a CEFR A1–C2 rubric to `prompt.ts` and `grade.ts`, and write the result back to `users.level`/`cefrLevel`.
  - Re-test monthly to prove progress.
- **4.4 Tutor quality:** add `tutor_reviews` (rating plus comment, booking-scoped), a CEFR/TEFL certification field, and show the AI-vs-tutor calibration agreement as a trust signal.
- **4.5 Enable tutors:** turn `NEXT_PUBLIC_TUTORS_ENABLED` on per organization, and backfill `instruction_languages` so tutors can lean on chat translation (UgaJapa) for low-level learners.

- **4.6 Tutor vetting.** English is Uganda's official language, but for most Ugandans it is a second language, and fluency varies. Approval must be based on evidence, not nationality.
  - **English proficiency test:**
    - Reuse the examiner in `lib/interview` (Gemini Live) as a tutor-applicant interview, with the CEFR rubric from 4.3.
    - Passing requires **C1 or higher**, with no dimension below a set floor.
    - Run it in `app/api/tutors/apply/route.ts` before the application reaches admin review.
    - Store the result on `tutor_profiles` (`cefrLevel`, `vettingInterviewId`).
  - **Clarity check:**
    - Run Azure pronunciation assessment (`lib/roleplay/pronunciation.ts`) on a set of read-aloud passages.
    - It scores intelligibility, not accent, so it doesn't penalize a Ugandan accent, only unclear speech.
  - **Teaching check:**
    - A recorded 15-minute trial lesson with a staff member or a volunteer learner, scored on a short rubric: correction quality, talk-time balance and level adaptation.
    - The admin approves in the existing `app/api/admin/tutors/[id]` flow, now with the scores shown.
  - **Ongoing quality:**
    - Learner reviews (4.4) and the AI-vs-tutor score agreement rate (`tutor_evaluations.agreesWithAi`).
    - A tutor whose rating or agreement falls below a threshold is flagged for re-review.
  - **Trust badge on the learner side:**
    - Shows "Verified C2 English · clarity 92 · 4.8★ (120 lessons)".
    - This answers the "native speakers only" bias directly with evidence.

- **4.7 Structured teaching syllabus (general language teaching + personal fixes).** Tutors teach a coherent English course, not only the learner's latest mistakes. Every lesson combines **(a)** the next syllabus step with **(b)** a short slot for that learner's weak points.

  **Syllabus.** Build it on the **existing** course tables (`courses → courseLevels → units → lessons → lessonPhases`, `src/schema.ts:445-508`). No second curriculum system.
  - Add a `cefrLevel` column to `courseLevels`: A1, A2, B1, B2, C1, C2.
  - Add `canDo` statements to `units`, for example "B1: can describe past experiences and give reasons".
  - Each unit has balanced strands:
    - **speaking** and **listening** (the AI role-play scenarios already linked by `lessons.scenarioId`);
    - **grammar** (an explicit sequence, e.g. present simple → past simple → present perfect → conditionals);
    - **vocabulary** (topic sets);
    - **pronunciation** (sound and stress points);
    - **reading and writing** (short texts and tasks; currently missing, added as a new `phaseKey` value).
  - Author the English course once through the idempotent `src/seed.ts` pattern, A1 to C1, aligned to CEFR descriptors. Localize its learner-facing text with the Phase 2 pipeline.

  **Tutor lesson structure.** A standard 30 or 60-minute template stored as `lessonPhases` rows:
  - warm-up (review of last lesson and the homework study pack);
  - present the new point;
  - controlled practice;
  - free practice (role-play from the unit);
  - a **personal fix slot of 5–10 minutes**, taken from the briefing (4.1);
  - wrap-up and homework.

  The ratio is configurable. The default is about 75% syllabus and 25% personal fixes. Beginners get more syllabus; advanced learners preparing for an exam get more targeted work.

  **Lesson plan for each booking.**
  - Add `unitId`/`lessonId` (nullable) to `tutor_bookings`. `live_lessons` already has `unitId` (`schema.ts:1012`).
  - Before the lesson, `getAIProvider().generateJSON` drafts the plan:
    - the learner's next syllabus lesson from `studentLessonProgress`;
    - their top weak points from 3.1;
    - their CEFR level from 4.3.
  - The output fills the template: objectives, explanation notes in the instruction language, practice activities, role-play prompt, fix-slot exercises, and homework.
  - The tutor reviews and edits it in TutorConsole.
  - Stored as `lesson_plans`: bookingId, unitId, plan JSON, tutorEdited, taughtAt.

  **Group live lessons follow the syllabus only.** Each unit's live lesson teaches the shared syllabus point. The personal fix work goes into each learner's AI study pack afterwards, because a group lesson can't serve individual weak points.

  **Progress is tracked by syllabus, not just by mistakes.**
  - After a lesson, the tutor marks the unit's can-do statements as *introduced*, *practised* or *achieved*.
  - The AI sessions and the CEFR re-test (4.3) confirm *achieved*.
  - The learner sees a CEFR progress map: units completed per level.
  - The tutor briefing (4.1) shows both "where they are in the syllabus" and "what they keep getting wrong".

  **Tutor teaching method.** A short onboarding module in tutor sign-up (`app/onboarding/tutor/*`):
  - how to use the template;
  - correcting errors without breaking flow;
  - controlling teacher talk time;
  - using the briefing and the plan.

  Finishing the module, plus the trial-lesson rubric in 4.6, is required for approval.

- **4.8 Tutor and learner share no language.** A Ugandan tutor and a Japanese, Brazilian or Arabic-speaking beginner may share no language at all. The plan uses the method professional language schools already use, backed by technology. Seven parts:

  1. **Teach English through English (the main method).**
     - Schools such as Berlitz and Cambly teach beginners entirely in the language being learned. The teacher uses simple speech, pictures, gestures, acting things out, demonstrating, and short yes/no questions to check understanding.
     - This is the core of the tutor training module (4.7). Tutors learn to grade their language to the learner's level and never rely on translation as the main channel.
  2. **The AI covers the very first steps, in the learner's own language.**
     - Absolute beginners (A0) start with AI sessions, which already explain in the learner's native language (the existing native/target split).
     - A new **"Classroom English starter" unit** (A0, seeded through 4.7) teaches about 30 survival phrases and tutor instructions: "listen", "repeat", "again, please", "slower, please", "I don't understand", "How do you say…?", "What does … mean?".
     - Booking a 1:1 tutor is recommended after this unit, and a warning shows before it.
  3. **On-screen lesson panel beside the video.**
     - The lesson plan (4.7) produces slides: an image, the English phrase, and that learner's own **native-language translation underneath**.
     - The panel is synced live between tutor and learners through the existing `lib/realtime`. Each learner's translation comes from Phase 2 localization or is generated per learner.
     - So even when the tutor's explanation is spoken in English, the learner can read what it means.
  4. **Live translated captions in the video call.**
     - Each learner's browser runs the Azure Speech SDK translation recognizer on the tutor's audio and shows captions in the learner's native language. This is the same SDK and token route (`/api/speech/token`) already used in `lib/roleplay/pronunciation.ts`.
     - The tutor's side gets the learner's speech translated into English.
     - Captions are **on by default for A0–A1 and fade out with level**: partial at A2, off by default from B1. This builds understanding without creating dependence. The learner can always toggle them.
     - Captions only render on screen. The audio itself is never translated.
     - Cost: Azure translation is billed per audio minute, so it is capped by plan and level and tracked in the `ai_usage` ledger (3.6).
  5. **A private "Explain in my language" button.**
     - The learner taps it, and the AI (`getAIProvider()`) gives a two-sentence native-language explanation of the tutor's last sentence or the current slide.
     - Only that learner sees it, so a confused learner gets unstuck without stopping the lesson.
     - The tutor sees a small indicator, so they know to slow down or re-explain.
  6. **Translated chat during the lesson.**
     - Reuse the booking's existing chat room (`tutor_bookings.chatRoomId`), which already translates per member through UgaJapa (`app/api/chat-rooms/[roomId]/messages/route.ts`).
     - The learner types in their language and the tutor reads English, and the reverse.
  7. **Match by shared language when possible.**
     - For A0–A1 learners, rank tutors first whose `instructionLanguages` include the learner's native language. Many Ugandan tutors also speak Swahili, French, Arabic or Kinyarwanda, which covers East and Central Africa, francophone markets and parts of the Middle East.
     - Recruit a small group of multilingual tutors.
     - Where no match exists, parts 1–6 carry the lesson.

  **Group live lessons** can mix nationalities. Each learner gets captions, slide translations and explanations in their own language, independently. The tutor teaches in English to everyone.

## Phase 5: Monetization

- **5.1 Learner payments: Stripe** (cards and wallets, for JP, KR and EU markets) through one `lib/billing/` module.
  - Plans: Free (AI-limited), AI Pro (subscription), and Hybrid (AI Pro plus N tutor credits).
  - Tutor bookings consume credits.
  - Enforce `users.tier` server-side through the `ai_usage` quota (3.6).
- **5.2 Tutor payouts:** a `tutor_earnings` ledger per completed booking, and a monthly payout export for Ugandan **mobile money** (MTN MoMo / Airtel Money via Flutterwave or similar) or Stripe Connect where supported.
- **5.3 B2B:** organization seat licences and invoicing on the existing `organizations` tables.

## Market validation and pilot (answers "is there significant potential?")

The engineering plan shows the product *can* be built. Only a measured pilot shows it *should* be scaled.

### Competitive landscape
Prices are approximate, from general knowledge, and must be checked before any pricing decision.

| Competitor | Model | Approx. price | Gap AI-DOJO exploits |
|---|---|---|---|
| Duolingo Max | AI app | ~$15–30 / month | Gamified drills, little real conversation, no human |
| Speak / Praktika | AI speaking tutor | ~$10–20 / month | AI only; no human check, weak for business English |
| Cambly | Native-speaker chat | ~$10+ per 30 min/week plan | Unstructured talk; tutors don't know your weak points |
| Preply / italki | Tutor marketplace | ~$8–35 / hour | Quality varies; the tutor starts every lesson blind; no AI practice between lessons |

**Positioning:** "Unlimited AI role-play + a tutor who already knows your mistakes, at a fraction of marketplace prices."

### Pricing hypothesis
These are to test in the pilot, not final.

| Plan | Contents | Hypothesis |
|---|---|---|
| **Free** | Limited AI sessions per day | Acquisition |
| **AI Pro** | Unlimited AI role-play, study packs, CEFR re-test | Price below Speak |
| **Hybrid** | AI Pro + 4 tutor lessons per month | Price well below 4 Preply lessons plus an AI app |

**Unit economics to confirm:**
- Ugandan tutor pay per hour. The rate must be fair, and higher than local alternatives.
- AI cost per active learner per month, measured by the `ai_usage` ledger (3.6).
- Payment fees.

The Hybrid margin must be positive at the expected tutor-minutes per learner.

### Pilot (6–8 weeks, after Phases 0–2 and 4.3/4.6)

**Cohort:**
- One B2B customer: a company or university in a non-English-speaking country, 30–100 learners. Use the existing organizations feature.
- Plus a small B2C group from two other regions, to test the "all nations" claim.

**Tutors:** 10–20 vetted Ugandan tutors (4.6).

**Success targets, set before the pilot starts:**

| Metric | Target to scale |
|---|---|
| Week-4 retention (active ≥ 2 sessions/week) | ≥ 40% |
| CEFR sub-score gain (placement vs. week-8 re-test) | Measurable gain for ≥ 60% of learners |
| Learner satisfaction with tutors (avg rating) | ≥ 4.5 / 5 |
| Briefing usefulness (tutor survey) | ≥ 80% say it changed their lesson |
| Tutor utilization (booked / offered hours) | ≥ 50% |
| AI cost per active learner per month | Under the planned AI Pro margin |
| Willingness to pay (B2C conversion offer / B2B renewal intent) | ≥ 5% B2C / signed renewal intent |

**Decision at the end:**
- **Scale** if most targets are met.
- **Iterate** on the weakest link if some are met.
- **Stop or pivot** if retention and score gain both fail.

## Development approach

**Branching and releases:**
- Feature branches from `dev`, then PR (CI runs lint, tests and tsc on non-draft PRs), then `dev`, then staging, then production.
- Each phase ships behind a flag, following the existing `NEXT_PUBLIC_TUTORS_ENABLED` pattern. Server-side flags are per organization, so the pilot customer gets features first.

**Database safety:**
- Schema changes go only through `db:generate`.
- Before any production migration: back up with `scripts/backup.ts` (output stays untracked after 0.1), apply to a Neon branch first, then promote.

**Instrumentation from day one:**
- Product events (PostHog) for: signup, placement done, session started/completed, study pack opened, booking made, lesson completed, subscription started.
- These are the pilot metrics above. Build the dashboard before the pilot, not after.

**AI quality and cost:**
- A small evaluation set of real (consented) learner turns per language, re-run whenever a prompt or model changes, to catch regressions in corrections and scoring.
- The `ai_usage` ledger feeds a cost-per-learner dashboard, with alerts when a route goes over budget.

**Team cadence:**
- Two-week sprints.
- Each phase ends with a short review: the verification checklist plus the relevant pilot metrics.
- Write `MEMORY.md` entries and update `ui-registry.md` per AGENTS.md.

**Content operations:**
- Generated content (localizations, UI catalogs, scenarios) is machine-first and human-reviewed for the highest-traffic languages.
- Learner "report a problem" feedback on any phrase feeds a review queue.

## Implementation scope for this round (user decision): Phase 0 + Phase 1 only

Phases 2–5 stay as the roadmap.

**Within 0.1, I will do:**
- untrack `backups/`;
- add it to `.gitignore`;
- create a branch off `dev`.

**I will not do without separate confirmation**, because these change shared history or user accounts:
- rewrite git history (`git filter-repo`);
- force-push;
- rotate share tokens or passwords.

For schema changes (1.1, 1.4 `expiresAt`, 1.7), I will generate the migrations with `db:generate`. I will not apply them to the production DB without a backup and your go-ahead.

## Recommended order and sizing

1. Phase 0: days; blocks everything.
2. Phase 1: about 1–2 weeks.
3. Phase 2 (2.1–2.6) plus 4.3 and 4.6: about 5–6 weeks. UI localization (2.4) is the largest piece. This is the minimum to sell worldwide and to start recruiting vetted tutors for the pilot.
4. Phase 3: about 3 weeks.
5. Phase 4.1, 4.2, 4.4, 4.7 and 4.8: about 6–7 weeks. The live captions and the synced lesson panel in 4.8 add about 2–3 weeks. Writing the A1–C1 syllabus content takes the most time, and an experienced English teacher should review it.
6. Phase 5: about 3 weeks.

Pilot with one market and one B2B customer before broad launch.

## Critical files

- **Phase 0:** `backups/`, `lib/tryout/gate.ts`, `app/api/speech/token/route.ts`, `app/api/chat/stream/route.ts`, `app/api/tryout/turn/route.ts`, `lib/cache.ts`, `lib/exportAuth.ts`
- **Phase 1:** `src/schema.ts`, `lib/auth/sync-user.ts`, `scripts/db-migrate.ts`
- **Phases 2–3:**
  - `lib/localization.ts`, `scripts/backfill-target-localizations.ts`, `lib/language-packs/`
  - `lib/roleplay/pronunciation.ts`, `lib/inngest/`, `lib/ai-providers/`
- **Phases 4–5:** `lib/interview/`, `components/tutors/TutorConsole.tsx`

## Verification

- **Each phase:** `rm -rf .next && npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`.
- **Phase 0:**
  - `git log --all -- backups/` shows nothing after the purge.
  - A spoofed `X-Forwarded-For` no longer resets limits (check with curl).
  - Stopping Redis makes guest AI routes return 429/503.
- **Phase 1:** run `EXPLAIN ANALYZE` on the session list and progress queries to show index scans; the bundle analyzer shows three.js gone from `/home` and `/onboarding`.
- **Phase 2:**
  - A brand-new sign-up with no choices gets target `en` and native from `Accept-Language`.
  - A test user with native=ja and target=en sees Japanese scenario text, meanings and usage tips in a session and in `/review`, and the UI chrome is in Japanese.
  - Repeat for one RTL language (ar): `<html dir="rtl">` and the layout mirrors correctly.
  - `db:check-localization` shows full coverage for every enabled native language.
  - The CI message-key check passes.
- **Phase 3:** completing a session fires the Inngest event (visible in the Inngest dev UI), and a study pack, SRS cards and a calendar task appear for that user only.
- **Phase 4:** a tutor with a booking can see the briefing, and a tutor without one gets 403. The CEFR test writes the learner's level.
- **Syllabus (4.7):**
  - Seeding the English course twice leaves the row counts unchanged.
  - A booking for a learner on unit B1-3 gets a plan whose new-material section is B1-3 content and whose fix slot lists that learner's top weak points.
  - A tutor-marked can-do statement appears on the learner's CEFR progress map.
- **Auto-translation (2.4):**
  - A first visit from a Japanese IP, simulated with the country header via curl, renders the marketing page in Japanese with the change-language notice.
  - Picking English overrides the guess on the next visit.
  - English lesson phrases stay English, and the browser's own translate leaves them untouched (`translate="no"`).
- **No shared language (4.8):**
  - In a test call, a Japanese-native A1 learner sees Japanese captions of the tutor's English speech and Japanese translations on the lesson slides.
  - "Explain in my language" returns a Japanese explanation visible only to that learner.
  - A B1 learner's captions are off by default.
  - Caption minutes are recorded in `ai_usage`.
- **Vetting (4.6):** a test applicant below C1 cannot reach admin review. The badge shows real stored values.
- **Pilot readiness:** every pilot metric is visible on the analytics dashboard with test data before the first learner joins.
- **Phase 5:** a Stripe test-mode checkout updates the tier, quotas are enforced, and a payout export is generated.
- Add a `MEMORY.md` entry and update `ui-registry.md` per AGENTS.md.


---

# Archived: Voice pipeline plan (earlier, appears implemented)

## Voice pipeline: mic capture, partial STT, and TTS delivery

## Context

Three symptoms in the roleplay voice loop:

1. **Mic sometimes captures nothing** — press, speak, release, no transcript, no error.
2. **Mic sometimes submits a few words before release** — a half-sentence turn goes to the model.
3. **TTS delivery lags and stutters** — the opening sentence plays, then a pause while the rest is "processed", then the remainder.

The conversation that prompted this assumed the app uses the browser Web Speech API with a server sitting between the mic and Azure. Neither is true, and acting on that advice would be a regression. The real shape is:

- `lib/roleplay/pronunciation.ts` runs the **Azure Speech SDK in the browser**, fed by a session-long AudioWorklet tap through a `PushAudioInputStream`, with the websocket pre-opened and a 300 ms pre-roll. `Speech_SegmentationSilenceTimeoutMs` is already tuned to 350.
- `lib/roleplay/tts.ts` synthesizes **browser-side** too, with `/api/tts` only as a fallback. There is no server hop on the hot path to remove, so GetStream/LiveKit ingest would *add* latency, not cut it.
- Decision taken: **stay on Azure.** Gemini Live emits no visemes (confirmed while building the AI examiner in `lib/interview/`), so migrating would mean re-deriving avatar lip-sync from raw PCM amplitude and losing the 28-language gendered voice map in `lib/language.ts`.

So the causes are local defects, and they are found. Intended outcome: a press always captures or says why it didn't; a release transmits the whole utterance; a reply is spoken as one continuous, gapless stream that starts on the first sentence in **every** language.

---

## What is actually wrong

### Symptom 2 — premature submission (highest confidence, simplest fix)

`onPointerLeave={voice.stop}` is on all five push-to-talk buttons. Sliding a finger or cursor off a 64 px button while still holding fires `pointerleave`, `stop()` runs, and the partial turn transmits. On mobile this happens constantly.

Five copies of the same handler set: [AvatarMicOverlay.tsx:86-92](AI-DOJO/components/roleplay/AvatarMicOverlay.tsx#L86-L92), [session/[sessionId]/voice/page.tsx:624-630](<AI-DOJO/app/(app)/session/[sessionId]/voice/page.tsx#L624-L630>), [session/[sessionId]/avatar/page.tsx:686-692](<AI-DOJO/app/(app)/session/[sessionId]/avatar/page.tsx#L686-L692>), [tryout/voice/page.tsx:246-249](AI-DOJO/app/tryout/voice/page.tsx#L246-L249), [tryout/avatar/page.tsx:253-256](AI-DOJO/app/tryout/avatar/page.tsx#L253-L256).

Secondary: `AvatarMicOverlay`'s auto-stop effect ([AvatarMicOverlay.tsx:48-55](AI-DOJO/components/roleplay/AvatarMicOverlay.tsx#L48-L55)) stops an open mic when `isAiResponding` flips true, and `bargeInRef` only covers the case where it was already true at press time.

### Symptom 2 — dropped tail

- [useVoiceInput.ts:18](AI-DOJO/lib/hooks/useVoiceInput.ts#L18) — `FINAL_FLUSH_GRACE_MS = 250`. Azure's forced final after `stopContinuousRecognitionAsync` routinely lands 400–800 ms later. The wait times out and the code falls back to the last *interim*, which itself trails the audio. The `finalWaiterRef` early-exit at [useVoiceInput.ts:156](AI-DOJO/lib/hooks/useVoiceInput.ts#L156) already ends the wait the instant the final arrives, so a larger cap costs nothing in the common case.
- [pronunciation.ts:293-297](AI-DOJO/lib/roleplay/pronunciation.ts#L293-L297) — `endCapture()` slams the gate shut on release. The last worklet block plus `resampleCarry` never reach the recognizer. There is a 300 ms `PRE_ROLL_MS` at the front and nothing at the back.

### Symptom 1 — silent capture failures

- [pronunciation.ts:501-514](AI-DOJO/lib/roleplay/pronunciation.ts#L501-L514) — on `canceled`, `rebuildRecognizer()` runs but **nothing restarts continuous recognition**. Audio keeps flowing into the new push stream with no recognition session consuming it. The press is silently lost; the *next* press works, because `isRecognizing` is false. This is exactly "sometimes nothing comes out."
- [pronunciation.ts:568-584](AI-DOJO/lib/roleplay/pronunciation.ts#L568-L584) — `closeRecognizer()` nulls `recognizer` but leaves `currentLang` set, and `rebuildRecognizer` does not take the `recognizerPromise` latch. A concurrent `ensureRecognizer` sees `recognizer === null` and builds a **second** recognizer; the global `pushStream` is overwritten and one of them is orphaned.
- [pronunciation.ts:94-118](AI-DOJO/lib/roleplay/pronunciation.ts#L94-L118) — `acquireMicStream` checks `readyState === 'live'` but not `track.muted`. A track can be live-but-muted (another app grabs the device, a Bluetooth route switch). The tap then produces digital silence with no error anywhere.
- [useVoiceInput.ts:232-239](AI-DOJO/lib/hooks/useVoiceInput.ts#L232-L239) — when `buffered` is empty, `stop()` does nothing at all. No callback, no message. Every failure above surfaces to the learner as a dead button.

### Symptom 3 — the mid-reply stall

[tts.ts:925-927](AI-DOJO/lib/roleplay/tts.ts#L925-L927) and [tts.ts:998-1001](AI-DOJO/lib/roleplay/tts.ts#L998-L1001):

```js
function isQueueIdle() { return utteranceQueue.length === 0 && !queuePump; }
...
if (isQueueIdle()) emit();
```

`queuePump` stays non-null for the whole reply. So after the opening sentence is emitted, `isQueueIdle()` is false until the queue fully drains — meaning **nothing else is ever queued mid-reply** unless the group passes `MAX_GROUPED_CHARS` (400), which most replies never do. Everything else waits for `flushStreamTts`, i.e. until generation has finished.

`prepareAhead()` can only prepare items already *in* the queue, so the pipeline it exists to fill is empty precisely when it matters. The audible result is: opening sentence → silence while the model finishes and the remainder is synthesized cold → remainder. That is the reported stutter.

### Symptom 3 — Japanese/Chinese/Korean never stream at all

[sentence-split.ts:14](AI-DOJO/lib/roleplay/sentence-split.ts#L14):

```js
const SENTENCE_BOUNDARY = /[。！？.!?](?=\s|⟧)|\n/g;
```

CJK text does not put a space after `。`. Real output `⟦こんにちは。⟧これは挨拶です。言ってみましょう` finds **no** boundary: the span-internal `。` is skipped, and the one after `です` is followed by `言`, so the lookahead fails. `findSentenceEnd` returns -1 for the entire stream, and the first audio arrives only at `flushStreamTts` — time-to-first-audio equals full generation time. Japanese is the first language in `lib/language.ts`.

The existing test passes only because its fixture ([sentence-split.test.ts:49-53](AI-DOJO/lib/roleplay/sentence-split.test.ts#L49-L53)) has spaces after `。` that real model output does not have.

Thai, Khmer and Burmese (`th`, `km`, `my` in `lib/language.ts`) have no sentence terminators at all and hit the same wall.

### Symptom 3 — the residual seam between clips

Each utterance is its own `SpeakerAudioDestination` → `HTMLAudioElement`, in `Audio24Khz96KBitRateMonoMp3` ([tts.ts:314-315](AI-DOJO/lib/roleplay/tts.ts#L314-L315)). Even fully buffered, resuming an element has a start delay, and MP3 carries encoder delay/padding as silence at each clip head. Cross-utterance seams are audible however well the pipeline is fed.

---

## The plan

### Phase 1 — Push-to-talk input (fixes symptom 2's premature submission)

New `lib/hooks/usePushToTalk.ts`, alongside the existing hooks in `lib/hooks/`. It wraps `useVoiceInput` and returns a props object to spread onto the button, so the handler set exists once instead of five times (AGENTS.md §1, §6 — no second way of doing one thing).

- `onPointerDown` calls `e.currentTarget.setPointerCapture(e.pointerId)` before `start()`. The button then keeps receiving pointer events wherever the finger goes.
- **Drop `onPointerLeave` entirely.** With capture held it is either redundant or wrong; it is the bug.
- Keep `onPointerUp` / `onPointerCancel` / `onKeyUp` / `onBlur` as the release paths — `useVoiceInput.stop()` already ignores all but the first ([useVoiceInput.ts:190-191](AI-DOJO/lib/hooks/useVoiceInput.ts#L190-L191)).
- Guard `onKeyDown` with `e.repeat`.
- Absorb `AvatarMicOverlay`'s barge-in bookkeeping so the auto-stop-on-AI-response effect cannot close a mic the learner is holding: gate it on "not currently held" rather than on `bargeInRef`.

Convert all five call sites to it. Styling and ARIA stay in each component; only the event contract moves.

### Phase 2 — Capture reliability (fixes symptom 1 and symptom 2's dropped tail)

In `lib/roleplay/pronunciation.ts`:

- **Post-roll.** `stopContinuousRecognition()` keeps the gate open for `POST_ROLL_MS` (~250) and flushes `resampleCarry` before `endCapture()`, mirroring `PRE_ROLL_MS`. The release still stops the *transcript* immediately; only the audio already in the pipeline is allowed to land.
- **Restart recognition after a rebuild.** Extract `resumeRecognitionIfCapturing()`; call it at the end of the `canceled` recovery path so a mid-press reconnect keeps transcribing instead of going quiet.
- **Close the rebuild race.** Extract a single `startBuild(lang)` that owns `recognizerPromise` / `pendingLang`; both `ensureRecognizer` and `rebuildRecognizer` go through it. Clear `currentLang` in `closeRecognizer()`.
- **Mic health.** In `acquireMicStream`, reject a track that is `muted` as well as one that is not `live`, and attach `onmute` / `onended` handlers that null `micStream` so the next acquire re-gets the device. Report a mic-lost condition through the existing `onError` callback.

In `lib/hooks/useVoiceInput.ts`:

- Raise `FINAL_FLUSH_GRACE_MS` 250 → 900. The `finalWaiterRef` resolve means a phrase that finalizes promptly still transmits with no added wait; only the case that is currently *broken* pays.
- When a release transmits nothing, set `error` to a plain "No speech detected — hold the button while you speak." All five surfaces already render `voice.error`, so this lands everywhere for free. Clear it on the next `start()`.

`SEGMENTATION_SILENCE_MS` stays at 350 — release-to-transmit already re-joins fragments, and raising it would delay the post-release final.

### Phase 3 — Sentence boundaries (fixes CJK/Thai time-to-first-audio)

In `lib/roleplay/sentence-split.ts`:

```js
// Full-width CJK terminators are unambiguous — there is no "1。5" or "Mr。" —
// and real CJK text never puts a space after them. Only the ASCII terminators
// need the lookahead that stops a chunk boundary being read as a sentence end.
const SENTENCE_BOUNDARY       = /[。！？]|[.!?](?=\s|⟧)|\n/g;
const SENTENCE_BOUNDARY_FINAL = /[。！？]|[.!?](?=\s|⟧|$)|\n/g;
```

Add a length-based fallback for the scriptio-continua languages: when no terminator is found and the buffer exceeds `MAX_UNSPLIT_CHARS` (~160), split at the last whitespace outside a `⟦ ⟧` span. Never splits inside a span — the existing `insideSpan` guard is reused unchanged.

Fix the test fixtures to use realistic unspaced CJK, and add cases for Thai-style unterminated text.

### Phase 4 — Keep the synthesis pipeline full (fixes the mid-reply stall)

In `lib/roleplay/tts.ts`, delete `isQueueIdle()` and emit on pipeline depth instead:

```js
// Hold a group open only while there is already work buffered ahead of the
// voice. An empty queue means the character is about to run out of audio,
// and holding text back at that moment is the stall this replaces.
if (utteranceQueue.length < PREPARE_AHEAD) emit();
```

`prepareAhead()` then genuinely has items to prepare, so utterance N+1 is synthesized while N is speaking — which is what the existing comment at [tts.ts:694-704](AI-DOJO/lib/roleplay/tts.ts#L694-L704) already claims happens.

`MAX_GROUPED_CHARS` stays at 400, so a fast-generating model still groups several sentences into one utterance whenever the pipeline is full.

**Stated trade-off:** this cuts a reply into more utterances than the current design intends, costing some cross-sentence prosody (Azure only carries prosody within an utterance). Phase 5 makes the seams inaudible, which is what makes this trade worth taking.

### Phase 5 — Gapless PCM playback (removes the seam)

New `lib/roleplay/pcm-player.ts` — extracted for the same reason `sentence-split.ts` was: it is testable without the Azure SDK.

It owns a **module-level playback cursor** on the shared `AudioContext` from `getPlaybackContext()`:

- `createPcmSink(ctx, connect)` → `{ push(ArrayBuffer), end(), stop(), elapsedMs(), finished }`.
- `push` converts Int16LE → Float32 (carrying an odd trailing byte across chunks), builds an `AudioBuffer` at 24000 Hz, and schedules a `BufferSource` at the cursor; the cursor then advances by the buffer's duration. Utterance N+1's first block lands exactly where N's last block ended — **gapless by construction, across utterance boundaries**.
- The cursor is floor-clamped to `ctx.currentTime + LEAD_SEC` (~50 ms) so it can never be scheduled in the past.
- `elapsedMs()` = `(ctx.currentTime - startedAt) * 1000`, which is a more accurate viseme clock than `player.currentTime` is today.

In `tts.ts`:

- `getSpeechConfig()` → `Raw24Khz16BitMonoPcm`. (`/api/tts` stays MP3 — `speakViaServer` decodes a complete clip via `decodeAudioData` and is unaffected.)
- `prepareSsmlDirect` builds `new sdk.SpeechSynthesizer(speechConfig, null)` — no speaker output — and collects chunks from `synthesizer.synthesizing`. `prepare` buffers; `play()` hands the buffered chunks to a sink and streams the rest straight through. `visemeReceived` is unchanged; the clock source becomes `sink.elapsedMs()`.
- **Deletions this enables:** `attachToAnalyser`, `routedAudioElements`, the `wantPlay` / `onAudioStart` pause trick, and the whole `DRAIN_TICK_MS` / `STALLED_TICKS` / `NEVER_STARTED_TICKS` watchdog. End of playback becomes exact: synthesis complete **and** cursor reached. Sources connect to `ttsAnalyser` directly, so `holdAnalyser` / `releaseAnalyser` / `getTtsAnalyser` keep working as-is for the lip-sync amplitude fallback.
- `stop()` calls `sink.stop()` on every live source and resets the cursor. The existing three-step fallback chain (direct → `/api/tts` → `speechSynthesis`) in `playQueuedUtterance` is untouched: a browser where the sink cannot be built rejects at `prepare` or `play` and falls through exactly as today.

---

## Files

| File | Change |
|---|---|
| `lib/hooks/usePushToTalk.ts` | **new** — one push-to-talk contract with pointer capture |
| `lib/roleplay/pcm-player.ts` | **new** — gapless PCM scheduler on the shared cursor |
| `lib/roleplay/pcm-player.test.ts` | **new** — Int16→Float32, odd-byte carry, cursor continuity |
| `lib/roleplay/pronunciation.ts` | post-roll, rebuild restart + race, mic-health |
| `lib/hooks/useVoiceInput.ts` | grace 250→900, no-speech feedback |
| `lib/roleplay/sentence-split.ts` | CJK terminators, length fallback |
| `lib/roleplay/sentence-split.test.ts` | realistic unspaced CJK fixtures, Thai case |
| `lib/roleplay/tts.ts` | depth-based emit, PCM config, sink-based `prepareSsmlDirect` |
| 5 mic call sites | adopt `usePushToTalk` (paths listed above) |
| `ui-registry.md`, `MEMORY.md` | register the hook; log the fixes (AGENTS.md §3, §6) |

Not touched: `/api/tts`, `app/api/chat/stream/route.ts` (already correct — `no-transform` + `X-Accel-Buffering: no`, per-token SSE), `lib/language.ts`, `lib/roleplay/reply-speech.ts`.

---

## Verification

**Automated**
- `npm test` — `sentence-split.test.ts` must show a real unspaced Japanese buffer splitting at the first `。` during streaming (this fails before the change), plus the new `pcm-player.test.ts`.
- `npm run lint`.

**Manual, per symptom** — run `npm run dev`, open a session at `/session/[id]/voice` and `/session/[id]/avatar`:

1. *Premature submission*: hold the mic, speak, and **drag the pointer well off the button** mid-sentence before releasing. The mic must stay open and the full sentence must transmit. Repeat on a touch device or Chrome device-emulation.
2. *Dropped tail*: speak a sentence with a deliberate 1-second pause in the middle, release immediately after the last word. The transmitted turn must contain both halves and the final word.
3. *Silent failure*: with the mic held, kill the network for ~3 s to force a `canceled` reconnect — recognition must resume and the turn still transmit. Separately, release without speaking: the "No speech detected" message must appear.
4. *CJK first-audio*: a Japanese session must start speaking on the first `。`, not after the whole reply. Compare `ConnectionLatencyIndicator` (fed by `lib/roleplay/voice-latency.ts`) before and after — expect the largest single improvement here.
5. *Mid-reply stall*: a 4–6 sentence reply must play as one continuous run with no pause at sentence boundaries. Verify in the browser Performance panel that a second `speakSsmlAsync` is in flight while the first is still audible.
6. *Seam*: with `NEXT_PUBLIC_STREAM_TTS=0` (single-clip mode) as the reference, streamed playback should be indistinguishable in continuity.
7. *Fallbacks*: block the Azure synthesis websocket in devtools — playback must degrade to `/api/tts` and then to `speechSynthesis` without a hang.
8. *Lip-sync*: confirm on the avatar tab that the mouth still tracks the voice under the new `elapsedMs()` clock, and that the barge-in reset leaves it closed.
