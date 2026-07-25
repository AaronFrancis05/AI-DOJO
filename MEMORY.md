# Memory — Addendum 2: Split Session Views + Avatar Barge-in

Last updated: 2026-07-25

## What was built

**Independent session views:**
- `app/(app)/session/[sessionId]/chat/page.tsx` — text-only chat view with ChatPanel + RoleplayInputBar. Links to voice/avatar views in header.
- `app/(app)/session/[sessionId]/voice/page.tsx` — voice-only view with push-to-talk mic orb, live caption, mute toggle, ConnectionLatencyIndicator. Links to chat view.
- `app/(app)/session/[sessionId]/avatar/page.tsx` — full avatar view with Avatar3D/VoiceOnlyStage, ChatBubble overlay, AvatarMicOverlay with barge-in, mute toggle, latency indicator. Links to chat view.
- `app/(app)/session/[sessionId]/page.tsx` — **rewritten** as mode chooser: three cards (Chat, Voice, Avatar) with distinct accent colors.

**Shared hooks:**
- `lib/hooks/useVoiceInput.ts` — wraps Azure Speech SDK continuous recognition into React hook (`isListening`, `partialTranscript`, `finalTranscript`, `volumeLevel`, `start`, `stop`, `error`).
- `lib/hooks/useRoleplaySession.ts` — shared session hook loading session/scenario/character/conversations/goals with `submitTurnStream()` (SSE-aware) and `sendGreeting()`.

**Voice/Avatar components:**
- `components/roleplay/AvatarMicOverlay.tsx` — live volume-reactive mic indicator, partial caption, push-to-talk, barge-in (stops TTS if user speaks while AI is responding), error display.
- `components/roleplay/ConnectionLatencyIndicator.tsx` — good/degraded/offline states with color-coded dot + label. Exports `useLatencyMonitor` hook (pings `/api/chat/stream` via OPTIONS every 10s).

**Design tokens extended:**
- Voice interface colors documented in `ui-registry.md` for AvatarMicOverlay, ConnectionLatencyIndicator, and mode-chooser cards.

## Decisions made

- **All three views share `useRoleplaySession`** — no component imports another view's component.
- **Chat view is the hub** — voice and avatar views link back to chat, not to each other.
- **Barge-in via push-to-talk** — `handleStartListening` checks `isAiRespondingRef` and calls `stopTts()` before starting recognition. Not toggle-based.
- **Session page is now a chooser** — the old monolithic 60/40 layout (scene + sidebar) is replaced by three card buttons. The full layout remains only in the individual views.
- **ConnectionLatencyIndicator uses hardcoded hex values** for status colors (green/amber/red) since these are status indicators, not design tokens.

## Current state

- All 5 evaluation gap items (P1–P5) code-complete from prior session
- Addendum 1 (multilingual packs) code-complete from prior session
- Addendum 2 (split session views + avatar barge-in) code-complete this session
- TypeScript compilation not verified
- Migrations not applied to production DB
- Quick drills seed script not run

## Next session starts with

1. Run `npx drizzle-kit push` or apply `0018_expression_appropriateness.sql` to dev DB
2. Run `npx tsx scripts/seed-quick-drills-ja.ts` to seed drill data
3. Verify TypeScript compilation (`npx tsc --noEmit`)
4. Verify `lib/roleplay/tts.ts` has `stop()` and `setOnSpeakingChange()` exports (used by all three views)
5. Verify `lib/language.ts` has `getBCP47()` and `getNativeLangBcp47()` exports
6. Verify `components/roleplay/Avatar3D`, `ChatBubble`, `ChatPanel`, `RoleplayInputBar`, `VoiceOnlyStage` exist and match the expected props

## Open questions

- `useRoleplaySession` is duplicated with the old inline session logic in `page.tsx` (before rewrite). The old monolith is gone now — should verify the new hook covers all features (retry, celebration, phase toast, etc.)
- The avatar page uses `Avatar3D` and `ChatBubble` — verify these components exist in the codebase with matching prop interfaces
