# UI Component Registry

## Design Tokens
**File:** `lib/design-tokens.ts`  
**CSS Vars:** Defined in `app/globals.css` under `:root`

| Token | CSS Variable | Tailwind Class | Hex |
|-------|-------------|----------------|-----|
| Canvas bg | `--color-canvas` | `bg-dojo-canvas` | `#050B14` |
| Sidebar bg | `--color-sidebar` | `bg-dojo-sidebar` | `#010A18` |
| Surface bg | `--color-surface` | `bg-dojo-surface` | `#0B1526` |
| Surface raised | `--color-surface-raised` | `bg-dojo-surface-raised` | `#111D33` |
| Border | `--color-border` | `border-dojo-border` | `#1C2A42` |
| Accent (primary) | `--color-accent` | `bg-dojo-accent` | `#2D3BC5` |
| Success | `--color-success` | `bg-dojo-success` | `#2FAE66` |
| Warning | `--color-warning` | `bg-dojo-warning` | `#E3A939` |
| Danger | `--color-danger` | `bg-dojo-danger` | `#D14343` |
| Streak | `--color-streak` | `text-dojo-streak` | `#F0A93B` |
| Text primary | `--color-text-primary` | `text-dojo-text-primary` | `#F4F4F8` |
| Text muted | `--color-text-muted` | `text-dojo-text-muted` | `#8A93A8` |

**Radius:** `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`

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

## Route Map (Phase F1-F4)
| Route | Panel | Status |
|-------|-------|--------|
| `/home` | Home Dashboard | Static layout with mock data |
| `/hub` | Domain Grid | Listicle of 8 domain cards |
| `/dojo/[domainSlug]` | Domain Detail | Hero + situation list |
| `/dojo/[domainSlug]/[situationId]` | Situation Picker | Focus pills + mode toggle |
| `/dojo/[...]/character` | Character Selection | Grid + preview panel |
| `/session/new` | Roleplay Room Shell | Static chat layout (wireframe) |
| `/sessions/[id]/report` | Session Summary | Tabbed review + scores |
| `/progress` | Progress Analytics | Radar chart + activity tabs |
| `/leaderboard` | Leaderboard | Global/Friends/School tabs |
| `/messages` | Messages | Thread list + message view |
| `/calendar` | Calendar | Month grid + day agenda |
| `/settings` | Settings | Preferences + Notifications + Privacy |
| `/settings/avatar` | Avatar & Character | Tabbed: avatar presets + voice prefs |
| `/settings/billing` | Subscription | Plan cards |

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

### ConnectionLatencyIndicator

File: `components/roleplay/ConnectionLatencyIndicator.tsx`
Last updated: 2026-07-25

| Property         | Class / Value                                   |
| ---------------- | ----------------------------------------------- |
| Container        | `flex items-center gap-2 px-3 py-1.5 rounded-full border` |
| Good bg          | `bg-dojo-surface bg-opacity-80`                 |
| Good border      | `#3FB27F` (inline style)                        |
| Good dot         | `bg-[#3FB27F]`                                  |
| Good text        | `text-[#8FE2B5]`                                |
| Degraded bg      | `bg-[#2A2210]`                                  |
| Degraded dot     | `bg-[#F2A93B] animate-pulse`                    |
| Offline bg       | `bg-[#2A1416]`                                  |
| Offline dot      | `bg-[#E5484D]`                                  |
| Label text       | `text-[11px] font-semibold`                     |
| Latency text     | `text-[10px] text-white/40 font-mono`           |

**Pattern notes:**
- Hardcoded hex values used for dot/label colors because these are status-specific, not design tokens
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
| Phase bg pattern | `bg-dojo-{color}/20 text-dojo-{color} border-dojo-{color}/30` |
| Dot              | `h-1.5 w-1.5 rounded-full` (inline style for color) |
| Dot animation    | `animate-pulse` (all phases except `completed`) |
| Icebreaker       | bg `#2D3BC5` dot / `bg-dojo-accent/20 text-dojo-accent border-dojo-accent/30` |
| Guided           | bg `#16A34A` dot / `bg-dojo-success/20 text-dojo-success border-dojo-success/30` |
| Unguided         | bg `#D97706` dot / `bg-dojo-warning/20 text-dojo-warning border-dojo-warning/30` |
| Evaluation       | bg `#8B5CF6` dot / `bg-[#8B5CF6]/20 text-[#8B5CF6] border-[#8B5CF6]/30` |
| Completed        | bg `#64748B` dot / `bg-dojo-text-muted/10 text-dojo-text-muted border-dojo-border` |
| Fallback         | `bg-dojo-surface border-dojo-border text-dojo-text-muted` |

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
| Container           | `absolute top-20 right-4 z-20 w-72 rounded-2xl border border-dojo-border bg-dojo-surface/95 backdrop-blur-md shadow-2xl p-4 space-y-3` |
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
