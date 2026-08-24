# UI Component Registry

## Design Tokens
**File:** `lib/design-tokens.ts`  
**CSS Vars:** Defined in `app/globals.css` under `:root`

Values below are light mode (`:root`); `.dark` mirrors the same tokens in a warm dark variant — see `app/globals.css`.

| Token | CSS Variable | Tailwind Class | Hex (light) | Hex (dark) |
|-------|-------------|----------------|-----|-----|
| Canvas bg | `--color-canvas` | `bg-dojo-canvas` | `#F5F0E6` | `#1B1512` |
| Sidebar bg | `--color-sidebar` | `bg-dojo-sidebar` | `#EFE8D8` | `#130F0C` |
| Surface bg | `--color-surface` | `bg-dojo-surface` | `#FAF6EE` | `#241C17` |
| Surface raised | `--color-surface-raised` | `bg-dojo-surface-raised` | `#FFFFFF` | `#2C2119` |
| Border | `--color-border` | `border-dojo-border` | `#E3D9C4` | `#3C2E24` |
| Accent (primary) | `--color-accent` | `bg-dojo-accent` | `#C1392B` | `#DD5B47` |
| Accent soft | `--color-accent-soft` | `bg-dojo-accent-soft` | `#F5DAD3` | `#472922` |
| Success | `--color-success` | `bg-dojo-success` | `#16A34A` | `#2FAE66` |
| Warning | `--color-warning` | `bg-dojo-warning` | `#D97706` | `#E3A939` |
| Danger | `--color-danger` | `bg-dojo-danger` | `#DC2626` | `#D14343` |
| Streak | `--color-streak` | `text-dojo-streak` | `#EA580C` | `#F0A93B` |
| Evaluation | `--color-evaluation` | `bg-dojo-evaluation` | `#8B5CF6` | `#8B5CF6` |
| Icebreaker | `--color-icebreaker` | `bg-dojo-icebreaker` | `#D946EF` | `#D946EF` |
| Text primary | `--color-text-primary` | `text-dojo-text-primary` | `#221A14` | `#F5F0E6` |
| Text muted | `--color-text-muted` | `text-dojo-text-muted` | `#6B6153` | `#A99C8B` |

**Text-safe (`-strong`) status variants.** The status/phase hues above are tuned for fills, dots and borders. Used as small text they fall under 4.5:1 on the light canvas (and read dim on the dark one), so every *label* rendered in a status colour uses the `-strong` variant instead. Fills, dots and borders keep the base token.

| Token | CSS Variable | Tailwind Class | Hex (light) | Hex (dark) |
|-------|-------------|----------------|-----|-----|
| Success text | `--color-success-strong` | `text-dojo-success-strong` | `#15803D` | `#4ADE80` |
| Warning text | `--color-warning-strong` | `text-dojo-warning-strong` | `#B45309` | `#FBBF24` |
| Danger text | `--color-danger-strong` | `text-dojo-danger-strong` | `#B91C1C` | `#F87171` |
| Streak text | `--color-streak-strong` | `text-dojo-streak-strong` | `#C2410C` | `#F5B65C` |
| Icebreaker text | `--color-icebreaker-strong` | `text-dojo-icebreaker-strong` | `#A21CAF` | `#E879F9` |

**Radius:** `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`

**Fonts:** `--font-sans` (Inter, body/UI), `--font-mono` (Geist Mono), `--font-display` (Playfair Display, `font-display` utility) — used for hero/section headings on the marketing site.

## UI Primitives (`/components/ui/`)
| Component | Props | Usage Notes |
|-----------|-------|-------------|
| `Badge` | `variant: beginner\|intermediate\|advanced\|accent\|default` | Skill level badges, status labels |
| `Pill` | `variant: standard\|trouble\|default`, `active`, `onClick` | Outlined toggle pills, practice focus tags |
| `Card` | `raised`, `hoverable`, `onClick` | Surface container with border; raised uses `surface-raised` bg |
| `Button` | `variant: primary\|secondary\|ghost\|danger`, `size`, `loading` | Primary uses accent, secondary uses border+surface |
| `Toggle` | `enabled`, `onChange`, `label`, `description` | Binary switch for settings panels |
| `Tabs` | `tabs: Tab[]`, `renderPanel`, `defaultTab` | Underline-active-state horizontal tab set |
| `ProgressBar` | `value`, `max`, `size`, `color`, `showLabel` | Thin or medium bar with animated fill |
| `HexBadge` | `icon: LucideIcon`, `label`, `unlocked`, `size` | SVG hexagon clip path around lucide icon |
| `TrendValue` | `value`, `trend: up\|down\|neutral`, `trendLabel` | Number + ▲/▼ arrow with colour |
| `LiveBadge` | — | Pulsing red dot + "Live" text |
| `Avatar` | `name`, `src?`, `size`, `color` | Initials fallback with optional image |
| `RadarChart` | `data: RadarDataPoint[]`, `size`, `levels`, `color` | SVG-based radar/spider chart with labels |
| `BehaviorModeToggle` | `value`, `onChange` | Standard/Trouble pill toggle |
| `SliderRow` | `label`, `value`, `min/max`, `onChange` | Labelled range slider for settings |

## Marketing Components (`/components/marketing/`)
| Component | Props | Notes |
|-----------|-------|-------|
| `NavActions` | — | Theme toggle + Sign in / Get Started links, rendered in the marketing navbar |
| `DemoVideoDialog` | — | Fullscreen modal with custom video controls, triggered from the hero |
| `TryoutPanel` | — | Client-side target/native language picker on the hero; pulls target languages from `lib/language.ts` `TARGET_LANGUAGES` and native languages from `NATIVE_LANGUAGES`. Links to `/tryout?targetLanguage=..&nativeLanguage=..`, which runs a real (unauthenticated, client-local) guest roleplay preview — see `app/tryout/`, `app/api/tryout/turn/route.ts`, `lib/hooks/useGuestRoleplaySession.ts`. On preview completion the user is prompted to sign up via `/auth?targetLanguage=..&nativeLanguage=..`, which prefills those preferences and skips onboarding |

## App Shell (`/components/shell/`)
| Component | Notes |
|-----------|-------|
| `AppShell` | Wraps every (app) route; sidebar + UserCard + content |
| `Sidebar` | Nav list: Home, Hub, Progress, Leaderboard, Messages, Calendar, Settings |
| `UserCard` | Avatar + name + tier badge + level/XP bar — rendered at sidebar bottom |

## Roleplay Components (`/components/roleplay/`)
| Component | Notes |
|-----------|-------|
| `RoleplaySidePanel` | Goals checklist + vocabulary + Pause/Resume/End Session controls. Extracted as shared component rendered both inline (desktop sidebar, `hidden lg:flex`) and inside a mobile right-drawer (`lg:hidden`). |
| `RoleplayInputBar` | Text/voice toggle input + send button. Input has `min-w-0 flex-1` for proper shrink on narrow viewports. |
| `ConversationBubble` | Message display with speaker avatar, Japanese + romaji + English + emotion/gesture hints. |
| `AvatarStage` | Full desktop 3D avatar stage with name/role/emotion display; `compact` prop for smaller variant. |
| `AvatarPicker` | Searchable catalog grid (2→4 cols) of 43 avatars from `lib/avatar/catalog.ts`; `selectedId` + `onSelect(avatar)`; thumbnails from `/ai-avatars/thumbnails/*.webp`; ported from `ai-avatar-ui/src/components/AvatarPickerCore.js`. |
| `AvatarCaptionsOverlay` | Translucent `bg-black/30 border-white/10 backdrop-blur-sm` pill, absolutely positioned at `bottom-6` (override via `className`, e.g. `bottom-32` to clear the mic controls); `caption:string\|null` from `useAvatarCaptions.playCaption`; `aria-live=polite`. Always floats — never render it in flow, a reserved caption band crops the avatar viewport above it. |
| `AvatarViewport3D` | Adds `caption?:string\|null` prop (renders `AvatarCaptionsOverlay`). Nothing is shown until the character is both framed AND standing in its idle animation — until then a DOM-level progress bar ("Preparing {name}") sits over a fully transparent canvas, and the 3D content fades in over 500 ms. Calls `preloadAnimationClips()` on mount so the clips download alongside the model. |
| `PhaseTransitionCard` | Phase-change card, `aspect-[11/10] max-w-md`. The coach art from `PHASE_META.portraitSrc` is the card itself (full-bleed `background-image`, framed by `artSize`/`artPosition`), with the title/description over a top-left scrim and a numbered 1→6 stepper over a bottom scrim. Copy is `text-white` because it always sits on the dark artwork. |
| `ResultsAvatarBackdrop` | Shared backdrop for `LessonCompleteScreen` / `LessonIncompleteScreen`. Layers: blurred+dimmed copy of the art → radial mood glow → the art itself at full opacity, height-fitted and centred so the coach is never cropped or washed out → scrims limited to the top/bottom strips and the outer quarter of each side (where the stat panels sit). `fit="portrait"` caps and feathers small square art (`lesson-incomplete.png`, 380×380) instead of upscaling it to full height. Never put a full-screen scrim over the character. |

## Speech & Avatar Runtime (`/lib/roleplay/`, `/components/roleplay/three/`)

| Module | Notes |
|--------|-------|
| `lib/roleplay/tts.ts` | Browser-side Azure synthesis. Session views call `speakMixedText(text,…)` once from the stream's `onTextDone` — each reply is a single clip, not per-sentence streaming (the `feedStreamTts` / `flushStreamTts` helpers remain exported but currently have no callers). `speakMixedText` keeps ⟦ ⟧ span→SSML multi-voice switching. Falls back direct → `/api/tts` → `window.speechSynthesis`. Speaking state is reference-counted with a 350 ms settle so utterances don't flicker the avatar between talk/idle. `speakWhenAudioUnlocked(fn)` is for lines the app starts on its own rather than off a click (the welcome-back recap): it runs `fn` once the shared `AudioContext` is actually running, deferring to the first gesture instead of losing the line to autoplay policy. |
| `lib/roleplay/pronunciation.ts` | One shared mic `MediaStream` + one `AudioContext` per session, feeding the level meter and a session-long PCM tap (AudioWorklet, `ScriptProcessor` fallback) that streams 16 kHz mono PCM into the recognizer's `PushAudioInputStream`. Press opens the gate (`beginCapture`, +300 ms pre-roll); release closes it. Azure websocket pre-opened via `Connection.fromRecognizer`; handlers attached once; `Speech_SegmentationSilenceTimeoutMs=350`. `destroyRecognizer()` is the session-unmount teardown. Exports `getToken()` as the single Azure token cache (shared with `tts.ts`). |
| `lib/roleplay/mic-sfx.ts` | `playMicPress()` / `playMicRelease()` — synthesized push-to-talk earcons on the shared playback context, wired straight to `destination` (never through the lip-sync analyser). Called from `useVoiceInput`, not from individual buttons. |
| `lib/roleplay/conversation-history.ts` | `buildConversationHistory(rows)` — per-speaker column selection when rebuilding model history. AI turns read `messageTarget`, user turns `messageNative`. |
| `lib/roleplay/prompts/` | All role-play prompts. `buildTurnSystemPrompt(ctx)` / `buildTurnUserMessage(ctx,…)` are the only entry points; `phases.ts` holds the per-phase pedagogy, `shared.ts` the persona + formatting + ⟦ ⟧ contract + `buildIdentityAndGuardBlock`, `reply-contract.ts` the analyzer-facing description of what each phase emits (both imported by `ai-engine.ts` as leaf modules, not via the barrel). |
| `lib/roleplay/proficiency.ts` | `getLearnerProficiency(userId,lang)` averages the last 5 completed `evaluations`; `resolveDifficulty(authored, prof)` shifts the scenario's tier at most one step from measured performance. Surfaces as `SessionTurnData.effectiveDifficulty`. |
| `lib/roleplay/vocab-match.ts` | `userAttemptsVocabWord(...)` — word-boundary-aware check for whether the learner produced the drilled item. |
| `lib/roleplay/session-metrics.ts` | `sessionCompositePct(scores)` — the ONLY way to turn dimension scores into an overall percentage. Delegates to `computeCompositeScore`. Three hand-rolled variants previously disagreed (home/sessions divided by 100; the share page by 30/25/20/15/10). |
| `three/AnimationManager.ts` | Loads `.glb` clips (generated by `npm run avatars:convert`) through a module-level shared cache, so repeat mounts are free. `init()` waits for `Idle.glb` alone and returns; the other clips register as they arrive, and a mode change that lands while its clip is in flight is queued (`_pending`) rather than dropped — guard on `canPlay()`, not `hasClip()`, for anything in the manifest. `preloadAnimationClips()` starts the same fetches before an avatar is mounted (called from `AvatarViewport3D` and the avatar session page). Head/neck tracks are kept on all clips. `setPaused()` replaces dispose/re-init for idle-freeze. Exports `ONE_SHOT_CLIPS` — `EmotionSystem` reads the same set rather than repeating the names. `talk` is `Talking1.glb` (37s of real gesticulation); `Talking.glb` is still on disk but unused — its largest in-clip joint swing is 11°, so the character stood motionless through a whole reply. `_faceForward()` strips each clip's baked mean yaw from the root (and, on looping clips only, the head) at registration, so every clip faces the same way and `CameraIntent` stays the only thing that decides which way — Mixamo bakes the actor's original facing in, and Talking1 stood 30° off camera. |
| `three/ExpressionEngine.ts` | Emotion morphs + blink, written to EVERY morph mesh each frame. Exports `asMorphMesh`/`MorphMesh`, which `LipSync` shares. Ducks its own mouth weights to 0.2 while `isTalking`. |
| `three/LipSync.ts` | Driven by live `visemeReceived` events from `tts.ts`. Maps Azure viseme ids 0-21 onto the Oculus viseme set every catalog rig ships (`viseme_aa`…`viseme_RR`) with jaw coupling, blending between shapes (`VISEME_BLEND_SPEED`) instead of hard-switching. Keeps its weights in its OWN map and composes them over the influences with `Math.max` — `ExpressionEngine.update()` rewrites the same morphs earlier in the frame, so reading an influence back as "what we set last frame" pinned the mouth at ~a fifth of its target. Drives every mouth mesh (head, teeth, tongue), not just the head. Jaw timing is asymmetric — `MOUTH_OPEN_SPEED` 16 vs `MOUTH_CLOSE_SPEED` 9 — and the analyser's RMS is smoothed (`LOUDNESS_SPEED`) before it drives the opening, so the mouth follows the speech rather than the waveform. |
| `three/AnimatedModel.tsx` | `applyRestPose(scene)` + `AvatarScale.apply(scene)` run synchronously on the cloned scene, before React mounts it — in an effect they left a raw, unscaled T-pose on screen for the first frames. The model is `visible={false}` until the idle clip is running (2.5 s reveal timeout as a safety net). The primitive's `rotation` carries the grounding tilt as well as the `CameraIntent` yaw, since R3F owns that prop. |

Session pages derive `avatarMode` (`'idle' | 'listening' | 'talking'`) at render from AI-speaking state and `voice.isListening` — never stored, never set imperatively.

**The character's lines are spoken by the views, not by the session hook.** `useRoleplaySession` only ever hands reply text to the views (streaming callbacks, or the `recap` event); the views own mute state, captions and the TTS voices, so anything the character should *say* has to reach them. Appending a turn to `conversations` renders it in the transcript and nothing more. The welcome-back recap of a resumed session is raised as `recap` / `dismissRecap` for exactly this reason.

**The session clock is anchored on `session.startedAt`, never on page mount.** `/session/[id]/avatar` and `/session/[id]/voice` are two views of one session under a shared `RoleplaySessionProvider` (in `session/[sessionId]/layout.tsx`), so a mount-time anchor restarts "Session Time" at 00:00 every time the learner switches mode or reloads.

**Scores are six independent 0-100 dimensions.** Never render them against a per-dimension max, and never sum-and-divide to get an overall figure — call `sessionCompositePct`.

## Live Tutoring (`/lib/tutors/`, `/components/tutors/`)

| Module | Notes |
|--------|-------|
| `lib/tutors/config.ts` | `TUTORS_ENABLED` (from `NEXT_PUBLIC_TUTORS_ENABLED`) gates every tutor surface; `getLiveKitConfig()` returns null rather than throwing when unconfigured. Self-hosted LiveKit only — no cloud dependency. |
| `lib/tutors/rooms.ts` | `generateRoomName()` (random, never derived from the booking id), `canJoinBooking()` server-side time gate, `createRoomToken()` room-scoped JWT. `roomAdmin` only for the tutor. |
| `lib/tutors/bookings.ts` | `loadBookingForUser()` — collapses "not found" and "not yours" into one null so booking ids can't be probed. |
| `components/tutors/LiveRoom.tsx` | LiveKit room: video grid, mic/camera/screen-share, self-view PiP. Always disconnects on unmount. |

A LiveKit token **is** access to a room, so membership and the join window are both checked in `/api/live/token` before one is minted. The room name is only ever returned alongside a valid token, never in a listing.

Tutor availability is stored as a weekday + minutes-from-midnight in the **tutor's** timezone and expanded to UTC instants in `/api/tutors/[id]/availability`; the DB constraint `tutor_bookings_no_overlap` (see `drizzle/0036_*`) is what actually prevents a double-booking, with the read-side check in `/api/bookings` only there to produce a friendly 409.

## Avatar Catalog (`/lib/avatar/`)

| Module | Notes |
|--------|-------|
| `lib/avatar/catalog.ts` | 43-entry `AVATAR_DATA` + `AVATAR_SOURCES` (`/ai-avatars/models/*.glb` + `/ai-avatars/thumbnails/*.webp`); `getAvatar/getAllAvatars/setPersonaOverride` cache keyed `${instanceId}::${avatarId}` — port of `ai-avatar-ui/src/avatar/AvatarSources.js`. |
| `lib/avatar/catalog.ts` (session identity) | `avatarRoleLine(avatar)` = persona first sentence trimmed to `scenarios.aiCharacterRole` (varchar 150); `applySessionAvatarIdentity(scenario, selectedAvatarId)` overlays a session's picked avatar onto the shared scenario row at read time. Every read path (session GET, `loadSessionTurnData`, `/api/chat`, `/api/share/[token]`) goes through it — never mutate the shared row. |
| `lib/avatar/dojo-adapter.ts` | `DojoBrainAdapter` replacing `CharacterBrain` (`CharacterBrain.js:117-232`): `ask→POST /api/chat/stream` SSE + `POST /api/tts`, `history→GET /api/sessions/[id]`, `getSettings→GET /api/user/preferences\|/api/user/avatars`. |
| `lib/hooks/useAvatarCaptions.ts` | `splitIntoCaptionChunks(130)` + `playCaption(text,totalDurationMs)` (`MIN_CHUNK_MS=900` proportional) — port of `AvatarController.js:758-817`. |

## Route Map (Phase F1-F4)
| Route | Panel | Status |
|-------|-------|--------|
| `/home` | Home Dashboard | Static layout with mock data |
| `/hub` | Domain Grid | Listicle of 8 domain cards |
| `/dojo/[domainSlug]` | Domain Detail | Hero + situation list |
| `/dojo/[domainSlug]/[situationId]` | Situation Picker | Focus pills + mode toggle |
| `/dojo/[...]/character` | Character Selection | Grid + preview panel |
| `/session/new` | Roleplay Room Shell | Static chat layout (wireframe) |
| `/review` | Spaced Repetition | Due-card drill over `srsCards`; grade → `/api/review/answer` |
| `/tutors` | Tutor Discovery | Verified tutor list + upcoming bookings. Gated by `NEXT_PUBLIC_TUTORS_ENABLED` |
| `/tutors/[id]` | Booking | Slot picker from `/api/tutors/[id]/availability` → `POST /api/bookings` |
| `/live/[bookingId]` | Live Session | `LiveRoom` video + the tutor's evaluation form |
| `/sessions/[id]/report` | Session Summary | Verdict card + score breakdown + transcript |
| `/progress` | Progress Analytics | Radar chart + activity tabs |
| `/leaderboard` | Leaderboard | Global/Friends/School tabs |
| `/messages` | Messages | Thread list + message view |
| `/calendar` | Calendar | Month grid + day agenda |
| `/settings` | Settings | Preferences + Notifications + Privacy |
| `/settings/avatar` | Avatar & Character | Tabbed: avatar presets + voice prefs |
| `/settings/billing` | Subscription | Plan cards |
| `/auth` | Sign in / Register | Email+password and Google. "Forgot password?" opens `ForgotPasswordModal` with the typed email prefilled |
| `/auth/reset` | Set a new password | Landing page for the emailed reset link |

### Password reset (Neon Auth)

Entirely Neon Auth's flow — no custom route, no app-side token storage:

1. `ForgotPasswordModal` → `authClient.requestPasswordReset({ email, redirectTo: <origin>/auth/reset })`. Neon stores the token and sends the mail itself. The modal always reports success (except on real transport/rate-limit failures) so it never confirms which addresses are registered.
2. The emailed link points at Neon, not the app. Neon validates the token, then redirects to `/auth/reset?token=…` — or `/auth/reset?error=INVALID_TOKEN` when it is expired (1 hour), already used, or tampered with. **The reset page must read both params**: on `error`, or with no token at all, it shows the spent-link state with a "Request a new link" action rather than a form that can only fail on submit.
3. `authClient.resetPassword({ newPassword, token })` → `/api/auth/reset-password`.

`<origin>` must be a trusted origin on the Neon project, or step 2 returns `INVALID_CALLBACK_URL` instead of redirecting.

## Design Pattern Notes
- All cards use `bg-dojo-surface` with `border-dojo-border` by default
- Interactive cards: add `hoverable` prop for `hover:border-dojo-accent`
- Active/highlighted cards: use `raised` prop OR `ring-2 ring-dojo-accent`
- Gradients for domain hero areas use inline `style` with hex values from domain fixture
- All charts (Bar, Line, Radar) are SVG/Recharts-based — no images
- The color scheme is dark-only; no light mode is planned
- Tailwind v4 uses CSS variables via `@theme inline` — custom classes: `bg-dojo-*`, `text-dojo-*`, `border-dojo-*`

### AvatarMicOverlay

File: `components/roleplay/AvatarMicOverlay.tsx`
Last updated: 2026-07-25

| Property            | Class / Value                                   |
| ------------------- | ----------------------------------------------- |
| Container position  | `absolute bottom-0 left-0 right-0 z-30`         |
| Container layout    | `flex flex-col items-center gap-3 pb-8`         |
| Caption background  | `bg-dojo-surface/80 backdrop-blur-md`           |
| Caption border      | `border border-dojo-border border-dashed`       |
| Caption radius      | `rounded-xl`                                    |
| Caption text        | `text-sm text-dojo-text-primary/70 italic`      |
| Mute button bg      | `bg-white/5 backdrop-blur-md`                   |
| Mute button border  | `border border-white/10`                        |
| Mute button radius  | `rounded-full`                                  |
| Mic button size     | `h-16 w-16`                                     |
| Mic button radius   | `rounded-full`                                  |
| Mic idle bg         | `bg-dojo-accent`                                |
| Mic listening bg    | `bg-dojo-warning`                               |
| Mic listening glow  | `shadow-[0_0_30px_rgba(242,169,59,0.6)] ring-4 ring-dojo-warning/20` |
| Mic idle shadow     | `shadow-[0_10px_25px_rgba(45,59,197,0.5)]`     |
| Error text          | `text-xs text-dojo-danger`                      |
| Error container     | `bg-dojo-surface/80 px-3 py-1 rounded-lg`       |

**Pattern notes:**
- Mic button uses push-to-talk (onMouseDown/onMouseUp + touch equivalents), not toggle
- Barge-in: pressing mic while AI speaking calls `stopTts()` before starting recognition
- Caption bubble uses dashed border to distinguish from chat bubble
- Live caption falls back from external partial to voice.partialTranscript
- Note: this component is currently unreferenced — the live mic UI lives inline in `app/(app)/session/[sessionId]/voice/page.tsx` and `avatar/page.tsx`, both built on `useVoiceInput`/`lib/roleplay/pronunciation.ts`. Docs below describe that actual live implementation.

**`useVoiceInput` / `lib/roleplay/pronunciation.ts` (live mic capture, 2026-08-24):**
- `pronunciation.ts` prewarms the Azure Speech token + `SpeechRecognizer` on mount (`prewarmRecognizer`) so the first mic press doesn't pay for a network round trip before capture starts; the auth token is refreshed on an interval so long sessions don't silently stop capturing after the ~10min token TTL.
- `useVoiceInput().stop()` awaits any in-flight `start()` before issuing the stop, so a fast push-to-talk tap-and-release can't race ahead of the recognizer attaching its handlers and drop the utterance.
- `voice.volumeLevel` is driven by a real `AnalyserNode` RMS reading of the mic stream (independent of the Speech SDK's own audio input), not a proxy off transcript length — this is what the mic button's ring/scale and the voice-only orb's swell react to.
- **Press captures on the press itself.** A PCM tap on the shared mic graph runs for the whole session and feeds the recognizer through a `PushAudioInputStream`, so a press opens a gate on audio that is already flowing rather than starting a capture. `beginCapture()` runs on `startContinuousRecognition`'s synchronous prefix (which is why `useVoiceInput` calls it directly rather than behind `await ensureRecognizer`), and prepends the last 300ms of pre-roll. Audio captured while a cold recognizer is still building is held and flushed once the push stream exists.
- Release stops feeding the recognizer immediately, then transmits: instantly if the phrase finalized during the hold, otherwise as soon as the final lands, capped by `FINAL_FLUSH_GRACE_MS = 600` before falling back to the last interim.
- Mic press/release earcons come from `lib/roleplay/mic-sfx.ts` — short synthesized blips (rising on press, falling on release) on the shared playback `AudioContext` (`getPlaybackContext()` in `tts.ts`), connected straight to `destination` so the lip-sync analyser never sees them. Played from `useVoiceInput`, so every mic surface gets them. Not gated by the AI-voice mute toggle: they are input feedback, not the character's voice.
- Push-to-talk mic labels read "Hold to Speak" (all four session/tryout voice + avatar pages).
- `VoiceOnlyStage`'s `mode` prop now includes `'thinking'` (three pulsing dots + "Thinking" status pill) for the gap between mic release and the first streamed AI token, so the user isn't staring at a "Ready" orb wondering if their voice was dropped. The avatar (3D) page mirrors capture state via `EmotionSystem.startListening()/stopListening()` and shows a "Thinking…" caption for the same gap.

### ConnectionLatencyIndicator

File: `components/roleplay/ConnectionLatencyIndicator.tsx`
Last updated: 2026-08-24

| Property         | Class / Value                                   |
| ---------------- | ----------------------------------------------- |
| Container        | `flex items-center gap-2 px-3 py-1.5 rounded-full border` |
| Good             | `bg-dojo-success/10 border-dojo-success/40` · dot `bg-dojo-success` · text `text-dojo-success-strong` |
| Degraded         | `bg-dojo-warning/10 border-dojo-warning/40` · dot `bg-dojo-warning animate-pulse` · text `text-dojo-warning-strong` |
| Offline          | `bg-dojo-danger/10 border-dojo-danger/40` · dot `bg-dojo-danger` · text `text-dojo-danger-strong` |
| Label text       | `text-[11px] font-semibold`                     |
| Latency text     | `text-[10px] text-dojo-text-muted font-mono`    |

**Pattern notes:**
- Fully tokenised (the old hardcoded status hexes are gone) — the label uses the `-strong` text variant so it stays readable on the light canvas; the dot and 10%-tint fill use the base hue
- `useLatencyMonitor` hook exported from same file — polls via `fetch OPTIONS` every 10s
- Thresholds: <300ms good, <2000ms degraded, else offline

### Session Mode Chooser (session page)

File: `app/(app)/session/[sessionId]/page.tsx`
Last updated: 2026-07-25

| Property         | Class / Value                                   |
| ---------------- | ----------------------------------------------- |
| Container        | `flex h-full flex-col`                          |
| Card grid        | `grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full` |
| Card bg          | `bg-dojo-surface/60 backdrop-blur-sm`           |
| Card border      | `border-2`                                      |
| Card radius      | `rounded-2xl`                                   |
| Card icon box    | `h-14 w-14 rounded-full border-2 border-current` |
| Card title text  | `text-base font-bold text-dojo-text-primary`    |
| Card desc text   | `text-xs text-dojo-text-muted`                  |
| Hover state      | `hover:scale-110` on icon, `hover:bg-*/10` on card |
| Transition       | `transition-all duration-200`                   |

**Pattern notes:**
- Each mode card has a distinct accent color: Chat=accent, Voice=#3FB27F, Avatar=#8B5CF6
- Cards are links via `router.push` — no `<a>` tags
- Footer shows "View Report" link when session.status === 'completed'

### PhaseIndicator

File: `components/roleplay/PhaseIndicator.tsx`
Last updated: 2026-07-25

| Property         | Class / Value                                   |
| ---------------- | ----------------------------------------------- |
| Container        | `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold` |
| Phase bg pattern | `bg-dojo-{color}/20 text-dojo-{color}-strong border-dojo-{color}/40` |
| Dot              | `h-1.5 w-1.5 rounded-full` (inline style for color) |
| Dot animation    | `animate-pulse` (all phases except `completed`) |
| Orientation      | bg `#0EA5E9` dot / `bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40` |
| Icebreaker       | bg `#D946EF` dot / `bg-dojo-icebreaker/20 text-dojo-icebreaker-strong border-dojo-icebreaker/40` |
| Guided           | bg `#16A34A` dot / `bg-dojo-success/20 text-dojo-success-strong border-dojo-success/40` |
| Unguided         | bg `#D97706` dot / `bg-dojo-warning/20 text-dojo-warning-strong border-dojo-warning/40` |
| Evaluation       | bg `#3B82F6` dot / `bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40` |
| Completed        | bg `#F0A93B` dot / `bg-dojo-streak/20 text-dojo-streak-strong border-dojo-streak/40` |
| Fallback         | `getPhaseMeta()` falls back to `orientation` for unknown phases |

`PHASE_META` also carries the character art used by `PhaseTransitionCard`: `portraitSrc` plus `artSize`/`artPosition` (the `background-size`/`background-position` that frame the coach inside the card). Most phases use `cover`; `evaluation` zooms to `auto 175%` at `88% 24%` to push the scorecard baked into the left of that source art out of frame, and `completed` points at `celebration_avatar.png` rather than `lessoncomplete_avatar.png` because the latter has a headline and scorecard baked in.

Source of truth for these classes is `PHASE_META` in `lib/roleplay/phase-ui.tsx`. Orientation/Evaluation have no dojo token, so they use the Tailwind palette with an explicit `dark:` variant for the same reason the `-strong` tokens exist.

**Pattern notes:**
- Phase dot color is driven by inline `style` (not a Tailwind class) because the phase is dynamic
- All phases follow the same pattern: `bg-{color}/20 text-{color} border-{color}/30` except evaluation (uses hardcoded hex `#8B5CF6` — purple not defined as a token) and completed (muted)
- The `animate-pulse` dot is suppressed for `completed` phase

### SessionModeTabs

File: `components/roleplay/SessionModeTabs.tsx`
Last updated: 2026-07-25

| Property         | Class / Value                                   |
| ---------------- | ----------------------------------------------- |
| Container        | `flex items-center gap-0.5 rounded-lg border border-dojo-border bg-dojo-surface/80 p-0.5` |
| Tab button       | `flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all` |
| Active tab       | `bg-dojo-accent text-white shadow-sm`            |
| Inactive tab     | `text-dojo-text-muted hover:text-dojo-text-primary` |
| Icon             | `h-3 w-3`                                       |

**Pattern notes:**
- Active tab uses solid accent fill (`bg-dojo-accent text-white`), same as primary Button variant
- Inactive tabs use muted text with hover-to-primary, matching secondary/ghost button patterns
- Container mimics a segmented control: `border-dojo-border bg-dojo-surface/80 p-0.5`

### SessionInfoDrawer

File: `components/roleplay/SessionInfoDrawer.tsx`
Last updated: 2026-07-25

| Property         | Class / Value                                   |
| ---------------- | ----------------------------------------------- |
| Overlay wrapper  | `fixed inset-0 z-40 flex justify-end`           |
| Backdrop         | `absolute inset-0 bg-black/40`                  |
| Panel container  | `relative w-full max-w-xs h-full bg-dojo-surface border-l border-dojo-border shadow-2xl animate-in slide-in-from-right` |
| Close button     | `absolute top-3 right-3 text-dojo-text-muted hover:text-dojo-text-primary` |
| Close icon       | `h-4 w-4`                                       |

**Pattern notes:**
- Backdrop uses `bg-black/40` (standard overlay opacity across the app)
- Panel slides in from right using `animate-in slide-in-from-right` (shadcn animation utility classes)
- Close button follows the same `text-dojo-text-muted hover:text-dojo-text-primary` pattern as other dismiss buttons (VoiceCoachPanel, etc.)

### VoiceCoachPanel

File: `components/roleplay/VoiceCoachPanel.tsx`
Last updated: 2026-07-25

| Property            | Class / Value                                   |
| ------------------- | ----------------------------------------------- |
| Container           | `absolute top-20 right-4 left-4 sm:left-auto z-20 w-auto sm:w-72 rounded-2xl border border-dojo-border bg-dojo-surface/95 backdrop-blur-md shadow-2xl p-4 space-y-3` |
| Header title        | `text-xs font-semibold text-dojo-text-primary`  |
| Dismiss button      | `text-dojo-text-muted` + `X` icon `h-3.5 w-3.5` |
| Correction icon     | `AlertCircle h-3.5 w-3.5 text-dojo-warning shrink-0` |
| Original text       | `line-through text-dojo-text-muted`             |
| Corrected text      | `font-medium text-dojo-text-primary`            |
| Explanation         | `text-dojo-text-muted/80 mt-0.5`               |
| Bulb icon           | `Lightbulb h-3.5 w-3.5 text-dojo-warning`       |
| Section label       | `text-[11px] font-medium text-dojo-text-muted`   |
| Suggestion pill     | `rounded-full border border-dojo-border px-2.5 py-1 text-[11px] text-dojo-text-primary hover:border-dojo-accent` |
| Suggestion wrapper  | `flex flex-wrap gap-1.5`                         |
| Disabled action     | `disabled:opacity-40 disabled:active:scale-100` (retry + suggestion pills, via the `disabled` prop) |

**Pattern notes:**
- Uses `rounded-2xl` (the largest radius variant, matching mode chooser cards)
- `backdrop-blur-md` for glass effect, same as AvatarMicOverlay caption and mode chooser cards
- Suggestion pills follow the same shape as ChatPanel's suggested replies but use `text-[11px]` (smaller) vs `text-xs`

### ChatPanel

File: `components/roleplay/ChatPanel.tsx`
Last updated: 2026-07-25

| Property              | Class / Value                                   |
| --------------------- | ----------------------------------------------- |
| AI bubble             | `bg-dojo-surface-raised/90 border border-dojo-border` |
| User bubble           | `bg-dojo-accent/20 border border-dojo-accent/30` |
| Failed bubble         | `bg-dojo-danger/10 border border-dojo-danger/30` |
| Bubble radius         | `rounded-xl`                                    |
| Bubble padding        | `px-3.5 py-2.5`                                 |
| Bubble max width      | `max-w-[85%]`                                   |
| Speaker badge         | `h-4 w-4 rounded-full text-[8px] font-bold text-white` (inline `backgroundColor`) |
| Speaker name          | `text-[11px] font-semibold text-dojo-text-primary` |
| Message text          | `text-sm text-dojo-text-primary leading-relaxed` |
| Romaji text           | `text-[11px] text-dojo-text-muted italic`       |
| Native text           | `text-[11px] text-dojo-text-muted`              |
| Correction strikethrough | `line-through text-dojo-text-muted`          |
| Correction corrected  | `font-medium text-dojo-text-primary`            |
| Correction explanation | `text-dojo-text-muted/80 mt-0.5`              |
| Correction severity major | `bg-dojo-danger/20 text-dojo-danger`         |
| Correction severity moderate | `bg-dojo-warning/20 text-dojo-warning`     |
| Correction severity minor | `bg-dojo-accent/20 text-dojo-accent`        |
| Severity badge        | `h-3.5 w-3.5 rounded-full text-[8px] font-bold text-center` |
| Timestamp text        | `text-[10px] text-dojo-text-muted/60`          |
| Suggested reply pill  | `rounded-full border border-dojo-border bg-dojo-surface-raised/80 px-3 py-1.5 text-xs text-dojo-text-primary hover:border-dojo-accent` |
| Streaming cursor      | `w-0.5 h-4 bg-dojo-accent animate-pulse`       |
| Scroll-to-bottom btn  | `h-8 w-8 rounded-full bg-dojo-accent text-white shadow-lg hover:opacity-90` |
| Speaking wave bar     | `w-[3px] rounded-full bg-dojo-accent`          |

**Pattern notes:**
- Bubbles use `rounded-xl` (12px) consistently — not `rounded-2xl` (16px, used by modals/popups)
- Pending turns get `opacity-60`; failed turns get a red-tinted bubble + "Failed to send" label
- Copy button pattern: Copy icon → Check icon on success (same pattern as any copy action)
- Speaking wave is a CSS animation (`typing-bounce`) on 3 bars, same animation name used across the app for AI typing indicators
