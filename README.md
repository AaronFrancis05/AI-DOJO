# 🥋 AI DOJO — Japanese Arena for Ugandan Engineers

AI DOJO is an interactive, virtual roleplay simulation platform built to help Ugandan software engineers rapidly learn practical Japanese for offshore IT business environments. 

Instead of focusing purely on generic casual phrases, the application drops developers directly into simulated offshore workflows (such as daily standups, code reviews, and project alignments) to learn Japanese business (*Keigo*), structural syntax, and cultural communication protocols dynamically.

---

## 🎯 The Core Mission
- **Target Audience:** Ugandan software engineers looking to accelerate their careers in the Japanese offshore market.
- **Learning Philosophy:** Fast, immersive, and practical feedback cycles powered by large language models.
- **Focus Areas:** Technical requirements gathering, standup progress reports, and professional client communication.

Product intent, brand, and positioning live in [`PRODUCT.md`](PRODUCT.md).


---

## 🏗️ Technical Architecture & Stack

The platform functions as a full-stack Next.js application bound to a secure real-time cloud data pipeline:

```
Browser (UI / 3D / mic)
    │
    ├─ Pages, Route Handlers, authz ──► Next.js 16 (App Router)
    │                                      │
    │                                      ├─ Neon Postgres (Drizzle)
    │                                      ├─ Neon Auth
    │                                      ├─ LLM providers (via lib/ai-providers/)
    │                                      ├─ Upstash Redis
    │                                      └─ Inngest
    │
    ├─ STT / TTS ─────────────────────► Azure Speech (token minted by Next.js)
    ├─ AI interview audio ────────────► Gemini Live
    └─ Tutor live video ──────────────► Stream.io
```

| Layer | What it is |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Database | [Neon](https://neon.tech) serverless Postgres via [Drizzle ORM](https://orm.drizzle.team). Schema: `src/schema.ts`. Migrations: `drizzle/` |
| Auth | Neon Auth for identity and sessions. App-side roles, suspension, and user sync live in `lib/auth/` |
| LLM | Gemini, Azure OpenAI, Anthropic, Groq, or any OpenAI-compatible endpoint. Circuit breaker + ordered failover in `lib/ai-providers/` |
| Voice | Azure Cognitive Services Speech SDK in the browser (STT/TTS). Next.js issues short-lived tokens at `/api/speech/token` |
| AI interviews | Browser talks to Gemini Live with an ephemeral token from the app |
| Live tutoring | Stream.io video. In-app text chat is this project's own `chat_rooms` tables, not Stream Chat |
| Cache / realtime fan-out | Upstash Redis (`lib/cache.ts`, `lib/realtime/`) |
| Background jobs | Inngest (`lib/inngest/`) — TTS jobs, auth-user reconciliation |
| 3D avatars | `three` / `@react-three/fiber` / `@react-three/drei`, models under `public/ai-avatars/` |

Billing is not wired up yet. Premium plans are a placeholder in settings.

---

## 📂 Project Schema Blueprint

The Neon database coordinates information across three critical tracking tables to preserve structural history context seamlessly:
1.  **`scenarios`:** Stores the master blueprint rows for the dynamic roleplay contexts (e.g., target difficulty, AI character roles, and engineering learning goals).
2.  **`conversations`:** Manages chronological conversation log sequences back-to-back, linking both the learner (`user`) entries and Gemini's responses (`ai`).
3.  **`evaluations`:** Aggregates multi-dimensional performance scores (Vocabulary, Grammar, Fluency, Cultural Rapport, and Task Target fulfillment) along with language coaching string summaries at the conclusion of a session.

---

## 🚀 Quick Setup & Installation Guide

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) project (Postgres + Auth)
- At least one LLM API key (Gemini is the default)

Voice, Redis, Inngest, and live tutoring are optional for a basic text session.

### 1. Install

```bash
git clone https://github.com/AkademiaLimited/AI-DOJO.git
cd AI-DOJO
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Fill in at least:

- `DATABASE_URL`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET`
- `GEMINI_API_KEY` (or switch `AI_PROVIDER` and set the matching key)

Add `APP_ORIGIN` (and the same origin under Neon Console → Auth → Domains) when running anywhere other than localhost.
Every other variable is documented in `.env.example`.

### 3. Database

```bash
npm run db:migrate
npm run db:seed
```

Schema changes always go through Drizzle: edit `src/schema.ts`, then `npm run db:generate`. Do not hand-edit files in `drizzle/`.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Docker alternatives: `npm run docker:dev` (hot reload) or `npm run docker:prod`. Neon, Upstash, and AI providers stay external — they are not bundled in Compose.

A push to `main` that passes lint, test, and `next build` publishes the production `Dockerfile` to GHCR as `ghcr.io/<owner>/<repo>:latest` and `:sha-<git-sha>`. Lint and test also run on every branch push and on pull-request open/update.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm test` | Node test runner (`lib/**/*.test.ts`) |
| `npm run db:generate` | Generate a Drizzle migration from `src/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Idempotent seed (scenarios, vocab, users, curriculum, localizations) |
| `npm run db:localize` | Generate scenario localizations |
| `npm run db:check-localization` | Localization coverage check |

---

## Layout

```
app/                 Routes (authenticated shell, marketing, auth, onboarding, API)
components/          UI primitives and feature components
lib/                 Auth, AI, cache, curriculum, roleplay, language packs
src/schema.ts        Database schema (source of truth)
src/seed.ts          Idempotent seed
drizzle/             Generated SQL migrations
scripts/             One-off maintenance (migrate, localize, backup)
public/              Static assets and avatar models
```

A fuller map, plus engineering conventions, is in [`AGENTS.md`](AGENTS.md).

---

## Docs

| File | Audience |
| --- | --- |
| [`PRODUCT.md`](PRODUCT.md) | Product schema: users, purpose, brand |
| [`AGENTS.md`](AGENTS.md) | Engineering charter for anyone (human or agent) changing this repo |
| [`ui-registry.md`](ui-registry.md) | Design tokens, primitives, routes |
| [`MEMORY.md`](MEMORY.md) | Running log of notable fixes and decisions |
