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
