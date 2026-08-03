# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are Ugandan language learners — originally software engineers preparing for Japanese offshore roles, now expanded to a general audience practicing conversational skills through role-play. The user's job is to speak more fluently and confidently in real-world situations (restaurants, travel, business meetings, healthcare, shopping, school, daily life) rather than only memorizing vocabulary. [Inferred from README.md and the confirmed transition to a multilingual learning app.]

## Product Purpose

AI DOJO is a virtual simulation arena where learners practice conversations through realistic AI role-play scenarios. A learner picks a scenario, speaks or chats with an AI character in character, and gets instant feedback on accuracy, fluency, and cultural fit. Success means speaking with real confidence in live situations, measurable through per-session evaluation and progress tracking.

## Positioning

What a neighboring product could not truthfully copy: full conversational role-play with AI characters in realistic, task-oriented scenarios — voice and chat, in-scene feedback and scoring, and a progress loop that looks like a training arena, not a flashcard app. The product has transitioned from Japanese-only offshore training to multilingual language learning through the same role-play engine. [Transition confirmed by the user; language coverage beyond Japanese is not yet enumerated in code.]

## Operating Context

- Web app (Next.js App Router, Tailwind v4), used on desktop and mobile; marketing page is public, logged-in users redirect to `/home`.
- Sessions run as chat, voice, or 3D-avatar role-play; each session ends in a scored report.
- Scenario catalog is organized by domain (Restaurant, Travel, Business, Healthcare, Shopping, Education, Daily Life, and more), each with multiple situations.

## Capabilities and Constraints

- 8+ scenario domains, each with 12–20+ situations; AI chat, real-time voice, TTS/STT; per-session scoring (vocabulary, grammar, fluency, cultural rapport, task target); progress analytics, leaderboard, shareable session reports.
- Design system: dark-first theme with light mode available; dojo design tokens (`--color-dojo-*`) in `app/globals.css`; accent `#2D3BC5`.
- Existing page assets: `public/restaurant.png`, `public/avatar.png`, `public/demo-video.mp4` (served via `/api/video/demo`), `public/logo.png`.
- Existing on-page claims (50K+ learners, 1M+ conversations, 98% satisfaction, 20+ languages, partner names AKADEMIA LTD / IUEA / Makerere) are authored content; their real-world accuracy is unverified and any new version must not inflate them.

## Brand Commitments

- Name: "AI DOJO". Brand mark: `🥋` emoji used in nav/footer text and `public/logo.png`.
- Design system tokens and the accent color are the durable visual system across the product; a landing-page redesign should stay inside the dojo token vocabulary.
- Voice: confident, practical, arena/training-flavored; the product is an arena for real conversation, not a generic course.

## Evidence on Hand

- Working role-play engine with real sessions, scoring, and reports (repo routes under `app/(app)/` and `app/api/`).
- Demo video at `public/demo-video.mp4` and the hero demo card built on `public/restaurant.png` + `public/avatar.png`.
- Scenario domains and partner names listed above. No real customer testimonials, case studies, or published learner counts exist in the repo; do not fabricate them.

## Product Principles

1. Immersive practice beats passive study — the page should dramatize the live session, not list features.
2. Realism is the promise — show real scenarios and real role-play, not abstract marketing.
3. Instant feedback is the loop — make feedback visible as proof of value.
4. Speak to the learner's ambition — confidence in real conversations, from Uganda to the world.

## Accessibility & Inclusion

- Full app supports light and dark themes via the existing toggle; `prefers-reduced-motion` rules exist in `app/globals.css`. Marketing surface should honor both.
