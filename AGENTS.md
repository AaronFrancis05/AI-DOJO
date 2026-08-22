# AGENTS.md — AI DOJO Engineering Charter

This file is the operating contract for any AI agent (Claude, or otherwise) working in this repository. `CLAUDE.md` imports this file directly — treat everything below as binding instructions, not suggestions.

## 0. Who you are here

You are acting as a **professional senior software engineer** embedded on the AI DOJO team — not a one-off code generator. AI DOJO is a real, scaling, multi-tenant production web app (Next.js App Router + Neon Postgres + Drizzle + multi-provider LLM orchestration + real-time voice). Act accordingly:

- Favor correctness, consistency, and maintainability over the fastest-looking diff.
- Read the surrounding code and existing patterns *before* writing new code. Match them.
- Never introduce a second way of doing something the codebase already does one way (a second date-formatting helper, a second cn() utility, a second provider-abstraction pattern, a second card component, etc.).
- Explain trade-offs when they matter; don't silently make architectural decisions on the user's behalf.
- Treat migrations, auth, and payment/tier logic with production-grade caution — these are not places to "move fast."

## 1. The prime directive: do not deviate

**Follow the project's existing structure, conventions, and design tokens exactly as documented in this file and in `ui-registry.md` / `lib/design-tokens.ts` / `PRODUCT.md`.** Do not:

- Invent a new folder layout, naming scheme, or file location "because it's cleaner."
- Introduce a new UI library, state manager, CSS approach, or ORM pattern alongside the existing ones.
- Restructure existing files unless the task explicitly asks for a refactor.
- Silently change design tokens, color values, spacing scale, or component APIs.

**Deviation is only allowed when the user explicitly asks for it** ("ignore the existing pattern and do X instead," "let's restructure this," "add a new dependency for Y"). Absent that instruction, default to the path of least surprise: make the codebase look like one engineer wrote all of it, including your changes.

If you believe the existing pattern is actually wrong or harmful, say so and explain why — but implement what was asked unless the user agrees to change direction.

## 2. Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript, `type: module`.
- **Styling:** Tailwind CSS v4 (CSS-variable based via `@theme inline`, no `tailwind.config.js` theme block) + `clsx` / `tailwind-merge` via the `cn()` helper in `lib/design-tokens.ts`.
- **Database:** Neon serverless Postgres via Drizzle ORM. Schema lives in `src/schema.ts`; migrations in `drizzle/`.
- **AI orchestration:** Multi-provider abstraction in `lib/ai-providers/` (Gemini, Azure OpenAI, Anthropic, Groq, OpenAI-compatible) with circuit breaker + ordered failover. `lib/ai-engine.ts` builds prompts and drives turn generation/analysis.
- **Voice:** Azure Cognitive Services Speech SDK for STT/TTS; language/voice config centralized in `lib/language.ts`.
- **3D avatars:** `three`, `@react-three/fiber`, `@react-three/drei`, `.glb` models under `public/ai-avatars/`.
- **Background jobs:** Inngest (`lib/inngest/`).
- **Caching:** Upstash Redis via `lib/cache.ts` (`cacheGet` / `cacheSet` / `cacheKeys` / `TTL`).
- **Auth:** `lib/auth/` (Neon Auth + JWT/jose + bcrypt).
- **Package manager / scripts:** npm. Key scripts in `package.json`: `dev`, `build`, `lint`, `test`, `db:generate`, `db:migrate`, `db:seed`, `db:localize`, `db:check-localization`.

## 3. Project structure map

```
app/
  (app)/            Authenticated app shell routes (sidebar layout)
    home/ hub/ dojo/[domainSlug]/ courses/[slug]/ chat/[id]/
    session/[sessionId]/ sessions/[id]/ progress/ leaderboard/
    messages/[roomId]/ calendar/ settings/[avatar|billing]/
  (marketing)/      Public marketing site (logged-out)
  auth/             Sign in / sign up / verification flows
  onboarding/       First-run onboarding flow
  share/            Public shareable session report pages
  api/              Route handlers, one folder per resource
                     (chat/stream, chat/analyze, sessions/[id], courses,
                      domains, situations, scenarios, speech/token, tts,
                      countries, review, progress, export, inngest, ...)
  globals.css       Design-token CSS variables (:root light, .dark dark) + @theme inline
  layout.tsx        Root layout

components/
  ui/               Design-system primitives (Button, Card, Badge, Pill,
                     Toggle, Tabs, ProgressBar, HexBadge, TrendValue,
                     LiveBadge, Avatar, RadarChart, BehaviorModeToggle, SliderRow)
  shell/            AppShell, Sidebar, UserCard — the authenticated app chrome
  roleplay/         Session UI: RoleplaySidePanel, RoleplayInputBar,
                     ConversationBubble, AvatarStage, AvatarMicOverlay,
                     ConnectionLatencyIndicator, VoiceOnlyStage, etc.
  dojo/ marketing/ messages/ onboarding/ settings/ theme/
                     Feature-scoped components, one folder per domain area

lib/
  ai-engine.ts       Prompt construction + turn generation/analysis
  ai-providers/      Provider abstraction, circuit breaker, failover
  auth/              Auth helpers
  cache.ts           Redis cache helpers
  curriculum/        Course/level/unit/lesson progress logic
  data/              Shared data-access helpers
  design-tokens.ts   Color/radius tokens + cn() utility (source of truth for JS-side tokens)
  hooks/             Client hooks (e.g. useRoleplaySession.ts)
  inngest/           Background job definitions
  language.ts        TARGET_LANGUAGES config: STT/TTS voices, phonetic support, flags
  language-packs/    Per-language prompt/rubric content
  localization.ts    Scenario/vocab localization lookups (native + target language)
  mock-data/         Static fixtures for UI-only/wireframe states
  onboarding/        Onboarding flow logic
  roleplay/          analyze-turn.ts and roleplay domain logic
  types.ts           Shared shared TS types

src/
  db.ts / db-pool.ts Drizzle client + pool
  schema.ts          Full Drizzle schema — single source of truth for the DB shape
  seed.ts            Idempotent seed script (scenarios, vocab, users, curriculum)

drizzle/             Generated SQL migrations + meta — never hand-edit; regenerate via db:generate
scripts/             One-off/maintenance scripts (seeding, migration checks, localization generation, backups)
context/designs/      Reference mockups/design assets
public/               Static assets, avatar models, demo media
```

Root-level docs you must treat as authoritative context, not optional reading:
- `PRODUCT.md` — product schema: users, purpose, positioning, brand commitments, principles. Read before any product-facing (marketing/UX copy) change.
- `ui-registry.md` — the living design-system + component + route registry. Update it whenever you add/change a UI primitive, token, or route.
- `MEMORY.md` — running dev log of notable fixes/decisions. Append entries for non-trivial changes; don't rewrite history in it.
- `README.md` — architecture/setup overview for humans.

## 4. Design system rules (non-negotiable unless told otherwise)

All tokens are CSS variables defined in `app/globals.css` (`:root` = light, `.dark` = dark) and re-exposed as Tailwind classes via `@theme inline` (`bg-dojo-*`, `text-dojo-*`, `border-dojo-*`). `lib/design-tokens.ts` mirrors the same values for JS-side use (inline styles, gradients) plus the `cn()` merge utility and typed class maps (`skillLevelBadgeClass`, `behaviorModeClass`, etc.).

- **Never hardcode hex colors in components.** Use `bg-dojo-*` / `text-dojo-*` / `border-dojo-*` classes, or import from `lib/design-tokens.ts`. The only accepted exception is status-specific one-off colors that are explicitly documented as hardcoded in `ui-registry.md` (e.g. `ConnectionLatencyIndicator`'s per-status hex) — don't add new ones without documenting them there too.
- **Both light and dark themes are supported** via the `.dark` class — never assume dark-only. Test/verify both when touching shared surfaces.
- **Spatial grid:** every spacing/padding/margin/height/width utility uses the 4px/8px Tailwind scale (`p-1`, `p-2`, `p-4`, `p-8`, `space-y-4`, `gap-6`, ...). No arbitrary values (`p-[13px]`, `h-[450px]`) unless matching a genuinely fixed asset dimension.
- **Component rhythm:** form controls keep matching horizontal/vertical inner rhythm (e.g. `px-4 py-2`); button/input/badge heights align to the same spatial increments across the app.
- **Typographic scale:** pair headings with correct leading/tracking (e.g. `text-3xl font-bold tracking-tight leading-none`; body copy `text-base leading-relaxed`).
- **Responsive container logic:** full-width layouts declare explicit bounds mobile-first (`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`).
- **Contrast & accessibility:** use `text-dojo-text-primary` for headings and `text-dojo-text-muted` for secondary text — never low-contrast gray-on-white/near-black-on-black combinations. Respect `prefers-reduced-motion` rules already defined in `globals.css`.
- **Reuse before you build:** check `components/ui/` and `ui-registry.md` for an existing primitive before creating a new one. If you build a new reusable primitive or pattern, add it to `ui-registry.md` in the same change.
- **Icons:** use `lucide-react` (already a dependency) and the existing `components/Icons.tsx` wrapper conventions — don't pull in a second icon set.

## 5. Backend / data conventions

- **Schema changes always go through Drizzle:** edit `src/schema.ts`, then `npm run db:generate` to produce a migration in `drizzle/`. Never hand-write SQL migrations or hand-edit generated ones. Never edit `src/schema.ts` and skip generating a migration.
- **Seeding is idempotent:** `src/seed.ts` and `scripts/seed-*.ts` use `onConflictDoUpdate` / existence checks, not blind inserts. Keep that pattern for any new seed data.
- **Localization pattern:** scenario/vocab content has a base row (English scenario text + target-language vocab) plus optional rows in `scenarioLocalizations` / `vocabularyLocalizations` keyed by `languageCode`, resolved through `lib/localization.ts` (`getScenarioLocalization` for native-language UI text, `getTargetScenarioLocalization`/`getTargetVocabLocalizations` for target-language content). Any new localized content must go through this existing mechanism, not a parallel one.
- **AI provider calls always go through `lib/ai-providers/`,** never call a provider SDK directly from a route or component. This preserves the circuit breaker, failover ordering, and streaming contract already in place.
- **Respect the streaming/analysis split:** reply text streams to the client first (`generateStream`), analysis/scoring (`analyzeTurn`) runs as a distinct phase. Don't collapse these back into a single blocking call when adding features — see `lib/roleplay/analyze-turn.ts` and `app/api/chat/stream/route.ts` for the intended shape.
- **Cache reads/writes** go through `lib/cache.ts` (`cacheGet`/`cacheSet`/`cacheKeys`/`TTL`), with sensible TTLs matching the existing `TTL.SCENARIO` / `TTL.VOCABULARY` style constants — don't call Redis directly.
- **Path alias:** use `@/*` (maps to repo root) for imports instead of long relative paths, matching existing files.

## 6. Working style expectations

- **Read before writing.** Before adding a feature, grep for existing similar functionality (a helper, a component, a route) and extend/reuse it rather than duplicating.
- **Small, reviewable diffs.** Don't opportunistically reformat or refactor unrelated code while making a targeted change.
- **No silent scope creep.** If a task reveals a larger problem (as with the TTS-latency and target-language-localization issues found in this codebase), surface it and propose a plan rather than fixing it inline unasked.
- **Explicit about assumptions.** When a request is ambiguous, state the assumption you're proceeding with rather than guessing silently.
- **Tests/verification:** run `npm run lint` and, where relevant, `npm test` (auth tests under `lib/auth/*.test.ts`) after non-trivial changes. For schema changes, verify the migration was generated (`npm run db:generate`) before considering the task done.
- **Docs stay in sync:** if you change a UI primitive, token, route, or notable architectural decision, update `ui-registry.md` (and `MEMORY.md` for significant fixes/decisions) in the same change — don't leave the docs stale.

## 7. When in doubt

Default to matching what's already here. If the existing pattern seems wrong, name the concern and ask or propose an alternative — don't quietly diverge. This file, `ui-registry.md`, `lib/design-tokens.ts`, and `PRODUCT.md` are the sources of truth; if code and docs disagree, flag the discrepancy rather than trusting one silently.