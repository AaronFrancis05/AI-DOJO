/* ───────────────────────────────────────────────
   Home Dashboard (Panel 01 + Sessions merged)
   Authenticated landing page — profile, stats, session history with share/delete/report
   Queries real data from the DB API.
   ─────────────────────────────────────────────── */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RadialProgress } from '@/components/ui/RadialProgress';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { HexBadge } from '@/components/ui/HexBadge';
import { Button } from '@/components/ui/Button';
import { useUser } from '@/lib/auth/user-context';
import { resolveDisplayName } from '@/lib/auth/display-name';
import { useCurrentAvatarModel } from '@/lib/auth/avatar-context';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { type SessionRecord } from '@/lib/types';
import { getLeaderboardGlobal } from '@/lib/data/sessions';
import { getDomains, type DomainFixture } from '@/lib/data/domains';
import { sessionCompositePct } from '@/lib/roleplay/session-metrics';

const WelcomeBanner = dynamic(() => import('@/components/roleplay/avatar-variants/WelcomeBanner').then(m => ({ default: m.WelcomeBanner })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-full">
      <div className="h-12 w-12 rounded-full bg-dojo-border" />
    </div>
  ),
});
import {
  ArrowRight,
  Flame,
  BookOpen,
  Target,
  Footprints,
  MessageSquare,
  PenTool,
  Globe,
  Sparkles,
  Zap,
  Share2,
  Trash2,
  Trophy,
  Play,
  TrendingUp,
  UtensilsCrossed,
  Building2,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
  Repeat2,
  type LucideIcon,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ── Helpers ────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Aug 12, 2026" — the compact form the achievement grid captions with. */
function formatBadgeDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const computeTotalPct = sessionCompositePct;

/**
 * Sessions carry no duration, so practice minutes are an estimate at a flat
 * rate per completed session. Named rather than inlined because the daily-goal
 * ring and the activity chart must estimate it the same way or they disagree.
 */
const ESTIMATED_MINUTES_PER_SESSION = 5;

// ── Icon map ──────────────────────────────────────────

const iconMap: Record<string, LucideIcon> = {
  Footprints,
  MessageSquare,
  BookOpen,
  Flame,
  PenTool,
  Globe,
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const domainIconMap: Record<string, LucideIcon> = {
  restaurant: UtensilsCrossed,
  hotel: Building2,
  airport: Plane,
  hospital: HeartPulse,
  shopping: ShoppingBag,
  business: Briefcase,
  travel: Compass,
  daily_life: Sun,
};

interface JourneyItem {
  slug: string;
  name: string;
  completed: number;
  total: number;
  pct: number;
}

/**
 * The roadmap strip under the domain cards. Stages are counted in completed
 * sessions — the one figure every learner has from their first turn, and the
 * same one the domain cards above are built from, so the strip never claims
 * progress the cards contradict.
 */
const JOURNEY_STAGES = [
  { title: 'Start',    caption: 'First Steps',        sessions: 1 },
  { title: 'Build',    caption: 'Core Skills',        sessions: 5 },
  { title: 'Practice', caption: 'Real Conversations', sessions: 15 },
  { title: 'Master',   caption: 'All Domains',        sessions: 30 },
] as const;

const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'] as const;

function levelLabel(level?: string): string {
  const l = (level ?? 'beginner').toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** The level after this one, or null at the top of the ladder. */
function nextLevelOf(level?: string): string | null {
  const i = LEVEL_ORDER.indexOf((level ?? 'beginner').toLowerCase() as typeof LEVEL_ORDER[number]);
  if (i < 0) return LEVEL_ORDER[1];
  return i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null;
}

const NATIVE_GREETINGS: Record<string, string> = {
  en: 'Welcome back',
  ja: 'Okaeri',
  fr: 'Bienvenue de retour',
  es: 'Bienvenido de vuelta',
  de: 'Willkommen zurück',
  pt: 'Bem-vindo de volta',
  zh: '欢迎回来',
  ko: '어서 오세요',
  vi: 'Chào mừng trở lại',
  th: 'ยินดีต้อนรับกลับ',
  hi: 'वापसी पर स्वागत है',
};

function greet(nativeLanguage?: string): string {
  return NATIVE_GREETINGS[nativeLanguage ?? 'en'] ?? 'Welcome back';
}

/** Rotates once a day rather than once a render, so the hero holds still. */
const DAILY_LINES = [
  'Small steps every day lead to big conversations.',
  'Fluency is a habit before it is a skill.',
  'The awkward sentence you say beats the perfect one you do not.',
  'Five minutes today outruns an hour next week.',
  'You learn the language you use, not the one you study.',
];

function lineOfTheDay(): string {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return DAILY_LINES[dayIndex % DAILY_LINES.length];
}

type ActivityItem = { label: string; minutes: number };

const DEFAULT_WEEKLY_ACTIVITY: ActivityItem[] = dayNames.map(label => ({ label, minutes: 0 }));

type ActivityRange = 7 | 30;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Completed sessions bucketed into one column per day, oldest first.
 *
 * The 7-day view labels by weekday and the 30-day view by date, because a
 * month of "Mon, Tue, Mon, Tue…" says nothing about when anything happened.
 */
function computeActivity(sessions: SessionRecord[], days: ActivityRange): ActivityItem[] {
  const today = startOfDay(new Date());
  const buckets = new Map<number, number>();

  for (const s of sessions) {
    if (s.status !== 'completed' || !s.startedAt) continue;
    const day = startOfDay(new Date(s.startedAt));
    const offset = Math.round((today.getTime() - day.getTime()) / 86_400_000);
    if (offset < 0 || offset >= days) continue;
    buckets.set(offset, (buckets.get(offset) ?? 0) + 1);
  }

  return Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i;
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return {
      label: days === 7
        ? dayNames[d.getDay()]
        : `${d.getMonth() + 1}/${d.getDate()}`,
      minutes: (buckets.get(offset) ?? 0) * ESTIMATED_MINUTES_PER_SESSION,
    };
  });
}

function hasSevenDayStreak(sessions: SessionRecord[]): boolean {
  const completedDates = new Set(
    sessions
      .filter(s => s.status === 'completed' && s.startedAt)
      .map(s => new Date(s.startedAt).toDateString())
  );
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (!completedDates.has(d.toDateString())) return false;
  }
  return true;
}

interface Achievement {
  id: string;
  icon: string;
  label: string;
  unlocked: boolean;
  /** When the qualifying session happened — captioned under the badge. */
  unlockedAt: string | null;
}

function computeAchievements(sessions: SessionRecord[]): Achievement[] {
  // Oldest first, so "the session that unlocked this" is the first one that
  // satisfies the rule rather than whichever the API happened to return first.
  const completed = sessions
    .filter(s => s.status === 'completed' && s.startedAt)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  /** The date of the nth completed session (1-based), or null if never reached. */
  const dateOfNth = (n: number) => completed[n - 1]?.startedAt ?? null;

  const firstGrammarPass = completed.find(s => (s.grammarScore ?? 0) >= 90)?.startedAt ?? null;

  // The session at which the third distinct domain appeared.
  const seen = new Set<number>();
  let thirdDomainAt: string | null = null;
  for (const s of completed) {
    if (s.domainId == null) continue;
    seen.add(s.domainId);
    if (seen.size >= 3) { thirdDomainAt = s.startedAt; break; }
  }

  const streak = hasSevenDayStreak(sessions);

  return [
    { id: '1', icon: 'Footprints',    label: 'First Steps',      unlocked: completed.length >= 1,  unlockedAt: dateOfNth(1) },
    { id: '2', icon: 'MessageSquare', label: '10 Conversations', unlocked: completed.length >= 10, unlockedAt: dateOfNth(10) },
    { id: '3', icon: 'BookOpen',      label: '50 Words',         unlocked: completed.length >= 3,  unlockedAt: dateOfNth(3) },
    { id: '4', icon: 'PenTool',       label: 'Perfect Grammar',  unlocked: firstGrammarPass != null, unlockedAt: firstGrammarPass },
    // A streak is true of today or not at all — it has no earlier unlock date.
    { id: '5', icon: 'Flame',         label: '7-Day Streak',     unlocked: streak, unlockedAt: streak ? new Date().toISOString() : null },
    { id: '6', icon: 'Globe',         label: 'All Domains',      unlocked: thirdDomainAt != null, unlockedAt: thirdDomainAt },
  ];
}

// ── Home Page ─────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const user = useUser();
  const currentAvatarModelUrl = useCurrentAvatarModel();
  const greeting = greet(user?.nativeLanguage);
  const displayName = resolveDisplayName(user);
  usePageTitle(displayName ? `${greeting}, ${displayName}!` : `${greeting}!`);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<number | null>(null);
  const [activityRange, setActivityRange] = useState<ActivityRange>(7);
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [domains, setDomains] = useState<DomainFixture[]>([]);
  const [dueCount, setDueCount] = useState<number | null>(null);

  // How many words are ready to be seen again. Drives the review prompt below;
  // without it the SRS queue is invisible unless the learner goes looking.
  useEffect(() => {
    fetch('/api/review/due', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (typeof body.dueCount === 'number') setDueCount(body.dueCount);
      })
      .catch(() => {});
  }, []);

  // Load sessions from DB via API
  useEffect(() => {
    async function load() {
      try {
        const lang = user?.nativeLanguage ?? 'en';
        const res = await fetch(`/api/sessions?lang=${encodeURIComponent(lang)}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        }
      } catch (e) {
        console.error('Failed to load sessions:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.nativeLanguage]);

  // Load rank + domains for dashboard stats
  useEffect(() => {
    if (!user?.id) return;
    getLeaderboardGlobal().then(({ entries }) => {
      const me = entries.find(e => e.userId === user.id);
      if (me?.rank != null) setGlobalRank(me.rank);
    }).catch(() => {});
    getDomains().then(({ data }) => setDomains(data)).catch(() => {});
  }, [user?.id]);

  // Share a session
  async function handleShare(sessionId: number) {
    if (sharing[sessionId]) {
      navigator.clipboard.writeText(sharing[sessionId]).catch(() => {});
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        const link = `${window.location.origin}/share/${data.token}`;
        setSharing(prev => ({ ...prev, [sessionId]: link }));
        navigator.clipboard.writeText(link).catch(() => {});
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  }

  // Delete a session
  async function handleDelete(sessionId: number) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setDeleting(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeleting(null);
    }
  }

  const activeSession = sessions.find((s) => s.status === 'active' || s.status === 'paused');
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'completed'),
    [sessions],
  );
  const totalScore = completedSessions.reduce((sum, s) => {
    const pct = computeTotalPct(s);
    return sum + (pct ?? 0);
  }, 0);
  const avgScore = completedSessions.length > 0 ? Math.round(totalScore / completedSessions.length) : null;

  const activity = useMemo(
    () => (sessions.length === 0 && loading ? DEFAULT_WEEKLY_ACTIVITY : computeActivity(sessions, activityRange)),
    [sessions, activityRange, loading],
  );
  // Always today's own bucket, whichever range the chart is showing.
  const todayMinutes = useMemo(() => {
    const last = computeActivity(sessions, 7).at(-1);
    return last?.minutes ?? 0;
  }, [sessions]);

  const dailyGoal = user?.dailyGoalMinutes ?? 30;
  const dailyGoalPct = Math.min(Math.round((todayMinutes * 100) / dailyGoal), 100);

  const journey = useMemo<JourneyItem[]>(() => {
    const counts = new Map<number, number>();
    for (const s of completedSessions) {
      if (s.domainId != null) counts.set(s.domainId, (counts.get(s.domainId) ?? 0) + 1);
    }
    return domains
      .filter(d => counts.has(d.id))
      .map(d => {
        const total = Math.max(d.situationCount, counts.get(d.id) ?? 0);
        const completed = Math.min(counts.get(d.id) ?? 0, total);
        return {
          slug: d.slug,
          name: d.name,
          completed,
          total,
          pct: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 2);
  }, [completedSessions, domains]);

  const achievements = useMemo(() => computeAchievements(sessions), [sessions]);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  const xp = user?.xp ?? 0;
  const xpToNext = user?.xpToNext ?? 100;
  const xpRemaining = Math.max(xpToNext - xp, 0);
  const xpPct = Math.min(Math.round((xp / xpToNext) * 100), 100);
  const nextLevel = nextLevelOf(user?.level);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-6 lg:p-10">
      {/* ── Page heading (the mobile top bar already carries the title) ── */}
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
          {displayName ? `${greeting}, ${displayName}!` : `${greeting}!`} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-2 text-base leading-relaxed text-dojo-text-muted">
          Master real-world scenarios. Keep up the great work!
        </p>
      </div>

      {/* ── Profile hero: level, progress, headline stats ── */}
      <div className="relative overflow-hidden rounded-[--radius-lg] border border-dojo-border bg-dojo-surface-raised p-6 lg:p-8 shadow-lg">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-dojo-accent/10 blur-[80px]" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-dojo-success/10 blur-[80px]" />

        <div className="relative z-10 flex flex-col items-center gap-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex w-full flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-left xl:w-auto">
            {/* Avatar inside a ring of progress toward the next level. */}
            <RadialProgress
              value={xpPct}
              size={168}
              thickness={10}
              color="accent"
              className="shrink-0"
              label={`${xpPct}% of the way to ${nextLevel ?? 'the top level'}`}
            >
              <div className="relative h-32 w-32 overflow-hidden rounded-full border border-dojo-border bg-dojo-surface">
                {currentAvatarModelUrl ? (
                  <WelcomeBanner modelUrl={currentAvatarModelUrl} userName={displayName} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl font-bold text-dojo-accent">
                    {displayName ? displayName[0] : '?'}
                  </div>
                )}
              </div>
              <div className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-dojo-surface-raised bg-dojo-accent text-white shadow-lg">
                <Trophy className="h-4 w-4" />
              </div>
            </RadialProgress>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-dojo-text-muted">Level</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <span className="text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
                  {levelLabel(user?.level)}
                </span>
                {nextLevel && (
                  <Badge variant={nextLevel as 'intermediate' | 'advanced'} className="text-[10px]">
                    Next: {levelLabel(nextLevel)}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm italic leading-relaxed text-dojo-text-muted">
                &ldquo;{lineOfTheDay()}&rdquo;
              </p>

              <div className="mt-4 w-full max-w-md">
                <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-dojo-text-muted">
                  <span>{nextLevel ? `Progress to ${levelLabel(nextLevel)}` : 'Top level reached'}</span>
                  <span>{xp.toLocaleString()} / {xpToNext.toLocaleString()} XP</span>
                </div>
                <ProgressBar value={xpPct} color="accent" size="md" />
              </div>

              {globalRank != null && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-dojo-accent sm:justify-start">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {globalRank <= 3
                    ? "You're in the global top 3 — keep it up!"
                    : `Ranked #${globalRank} on the global leaderboard.`}
                </p>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-3 gap-4 xl:w-auto">
            <Card className="!bg-dojo-surface/60 border-dojo-border/60 !p-4 text-center backdrop-blur-sm">
              <Flame className="mx-auto mb-2 h-6 w-6 text-dojo-streak" />
              <p className="text-2xl font-black text-dojo-text-primary">{user?.streak ?? 0}</p>
              <p className="text-[10px] font-bold uppercase tracking-tight text-dojo-text-muted">Day Streak</p>
              <p className="mt-1 text-[10px] text-dojo-text-muted">Keep it up!</p>
            </Card>
            <Card className="!bg-dojo-surface/60 border-dojo-border/60 !p-4 text-center backdrop-blur-sm">
              <Target className="mx-auto mb-2 h-6 w-6 text-dojo-accent" />
              <p className="text-2xl font-black text-dojo-text-primary">{avgScore ?? 0}%</p>
              <p className="text-[10px] font-bold uppercase tracking-tight text-dojo-text-muted">Accuracy</p>
              <p className="mt-1 text-[10px] text-dojo-text-muted">
                {completedSessions.length > 0 ? `Across ${completedSessions.length} sessions` : 'No sessions yet'}
              </p>
            </Card>
            <Card className="!bg-dojo-surface/60 border-dojo-border/60 !p-4 text-center backdrop-blur-sm">
              <Zap className="mx-auto mb-2 h-6 w-6 text-dojo-warning" />
              <p className="text-2xl font-black text-dojo-text-primary">{xp.toLocaleString()}</p>
              <p className="text-[10px] font-bold uppercase tracking-tight text-dojo-text-muted">Total XP</p>
              <p className="mt-1 text-[10px] text-dojo-text-muted">Keep learning!</p>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Row 1: Daily goal · Weekly activity · Live session + quick stats ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Daily Goal */}
        <Card className="!p-6 lg:col-span-3">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">Daily Goal</h3>
          <div className="flex items-center justify-between gap-4">
            <RadialProgress
              value={dailyGoalPct}
              size={128}
              thickness={12}
              color="accent"
              label={`${todayMinutes} of ${dailyGoal} minutes practised today`}
            >
              <span className="text-2xl font-black leading-none text-dojo-text-primary">
                {todayMinutes}/{dailyGoal}
              </span>
              <span className="mt-1 text-[11px] font-medium text-dojo-text-muted">mins</span>
            </RadialProgress>
            <div className="text-right">
              <p className="text-xl font-black text-dojo-accent">{dailyGoalPct}%</p>
              <p className="text-[11px] font-medium text-dojo-text-muted">completed</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-dojo-text-muted">
            {completedSessions.length > 0
              ? 'Great progress! Keep practicing to reach your daily goal.'
              : 'Start a roleplay session to build your daily practice streak.'}
          </p>
          {/* Pick up the conversation already in progress rather than
              dropping the learner back at the catalogue to find it. */}
          <Button
            variant="primary"
            className="mt-6 w-full shadow-lg shadow-dojo-accent/20"
            onClick={() => router.push(activeSession ? `/session/${activeSession.id}` : '/hub')}
          >
            <Play className="h-4 w-4 fill-current" />
            {activeSession ? 'Resume Session' : 'Continue Practice'}
          </Button>
        </Card>

        {/* Weekly Activity */}
        <Card className="!p-6 lg:col-span-5">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
                {activityRange === 7 ? 'Weekly Activity' : 'Monthly Activity'}
              </h3>
              <p className="mt-1 text-lg font-bold text-dojo-text-primary">
                {activity.some(d => d.minutes > 0)
                  ? `${activity.reduce((sum, d) => sum + d.minutes, 0)} Total Minutes`
                  : 'No activity yet'}
              </p>
            </div>
            <select
              value={activityRange}
              onChange={(e) => setActivityRange(Number(e.target.value) as ActivityRange)}
              aria-label="Activity range"
              className="rounded-[--radius-sm] border border-dojo-border bg-dojo-surface px-3 py-1.5 text-xs font-semibold text-dojo-text-primary"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} barCategoryGap={activityRange === 7 ? '30%' : '15%'}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  interval={activityRange === 7 ? 0 : 'preserveStartEnd'}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-accent-soft)', fillOpacity: 0.4 }}
                  contentStyle={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: 'var(--color-text-muted)', fontSize: 11 }}
                  itemStyle={{ color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 700 }}
                />
                <Bar dataKey="minutes" fill="url(#barGradient)" radius={[6, 6, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Live session + quick stats */}
        <div className="space-y-4 lg:col-span-4">
          {activeSession ? (
            <Link href={`/session/${activeSession.id}`} className="block" suppressHydrationWarning>
              <div className={`group relative cursor-pointer overflow-hidden rounded-[--radius-lg] p-5 transition-all hover:shadow-xl ${activeSession.status === 'paused' ? 'border border-dojo-accent/30 bg-gradient-to-r from-dojo-accent/20 to-dojo-success/10' : 'border border-dojo-danger/30 bg-gradient-to-r from-dojo-danger/20 to-dojo-accent/10'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${activeSession.status === 'paused' ? 'text-dojo-accent' : 'text-dojo-danger'}`}>
                    {activeSession.status === 'paused' ? 'Resume Training' : 'Live Session'}
                  </span>
                  {activeSession.status !== 'paused' && <LiveBadge />}
                </div>
                <p className="mt-2 text-lg font-bold text-dojo-text-primary">
                  {activeSession.scenarioTitle ?? `Session #${activeSession.sessionNumber}`}
                </p>
                <p className="text-xs text-dojo-text-muted">Turn {activeSession.totalTurns} • Continue your conversation</p>
                <Button
                  variant="primary"
                  size="sm"
                  className={`mt-4 ${activeSession.status === 'paused' ? '' : 'bg-dojo-danger hover:bg-dojo-danger/90'}`}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {activeSession.status === 'paused' ? 'Resume Session' : 'Resume Now'}
                </Button>
              </div>
            </Link>
          ) : (
            <Card className="!p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-dojo-text-muted">No live session</p>
              <p className="mt-2 text-lg font-bold text-dojo-text-primary">Pick a scenario</p>
              <p className="text-xs text-dojo-text-muted">Nothing is in progress — start one from the Hub.</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.push('/hub')}>
                Browse Scenarios <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Review queue — only worth surfacing when something is actually due. */}
            {dueCount != null && dueCount > 0 ? (
              <Link href="/review" className="block sm:col-span-1">
                <Card hoverable className="h-full !p-4 border-dojo-warning/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dojo-warning/10">
                      <Repeat2 className="h-4 w-4 text-dojo-warning-strong" />
                    </div>
                    <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-dojo-text-muted" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-dojo-text-primary">
                    {dueCount} {dueCount === 1 ? 'word' : 'words'} to review
                  </p>
                  <p className="text-[10px] text-dojo-text-muted">Ready to see again</p>
                </Card>
              </Link>
            ) : (
              <Card className="h-full !p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-dojo-success/10">
                  <Repeat2 className="h-4 w-4 text-dojo-success-strong" />
                </div>
                <p className="mt-3 text-sm font-semibold text-dojo-text-primary">Nothing due</p>
                <p className="text-[10px] text-dojo-text-muted">Your review queue is clear</p>
              </Card>
            )}

            <Card
              hoverable
              className="h-full !p-4"
              onClick={() => router.push('/leaderboard')}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-dojo-success/10">
                <TrendingUp className="h-4 w-4 text-dojo-success-strong" />
              </div>
              <p className="mt-3 text-lg font-black text-dojo-text-primary">
                {globalRank != null ? `#${globalRank}` : '--'}
              </p>
              <p className="text-[10px] font-bold uppercase text-dojo-text-muted">Global Rank</p>
            </Card>

            <Card
              hoverable
              className="h-full !p-4"
              onClick={() => router.push('/progress')}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-dojo-accent/10">
                <Zap className="h-4 w-4 text-dojo-accent" />
              </div>
              <p className="mt-3 text-lg font-black text-dojo-text-primary">
                {xpRemaining.toLocaleString()} <span className="text-xs font-semibold text-dojo-text-muted">XP</span>
              </p>
              <p className="text-[10px] font-bold uppercase text-dojo-text-muted">To Next Level</p>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Row 2: Learning Journey & Achievements ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Learning Journey */}
        <Card className="!p-6 lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">Learning Journey</h3>
            <Button variant="ghost" size="sm" className="text-xs font-bold" onClick={() => router.push('/progress')}>
              View Roadmap <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {journey.length === 0 ? (
              <div className="rounded-[--radius-md] border border-dashed border-dojo-border/60 bg-dojo-surface/40 p-6 text-center md:col-span-2">
                <Globe className="mx-auto mb-2 h-8 w-8 text-dojo-border" />
                <p className="mb-1 text-sm font-bold text-dojo-text-primary">Your learning journey starts here</p>
                <p className="mx-auto max-w-sm text-xs leading-relaxed text-dojo-text-muted">Complete role-play scenarios in the Dojo to build up each domain on your roadmap.</p>
                <Button variant="primary" size="sm" className="mt-5" onClick={() => router.push('/hub')}>
                  Explore Scenarios <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ) : (
              journey.map((item, i) => {
                const Icon = domainIconMap[item.slug] ?? Sparkles;
                const isAccent = i === 0;
                const completed = item.pct >= 100;
                return (
                  <Link key={item.slug} href={`/dojo/${item.slug}`} className="group relative overflow-hidden rounded-[--radius-md] border border-dojo-border bg-dojo-surface/40 p-4 transition-all hover:border-dojo-accent">
                    <div className={`absolute left-0 top-0 h-1 w-full ${isAccent ? 'bg-dojo-accent' : 'bg-dojo-success/40'}`} />
                    <div className="mb-3 flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isAccent ? 'bg-dojo-accent/20 text-dojo-accent' : 'bg-dojo-success/20 text-dojo-success-strong'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-bold text-dojo-text-primary">{item.name}</p>
                      <Badge variant={completed ? 'success' : 'accent'} className="ml-auto text-[9px]">{completed ? 'Completed' : 'In Progress'}</Badge>
                    </div>
                    <p className="mb-3 text-[11px] leading-relaxed text-dojo-text-muted">{item.completed} of {item.total} scenarios practiced in this domain.</p>
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-dojo-text-muted">
                      <span>{item.completed} / {item.total} Situations</span>
                      <span>{item.pct}%</span>
                    </div>
                    <ProgressBar value={item.pct} color={isAccent ? 'accent' : 'success'} size="sm" />
                  </Link>
                );
              })
            )}
          </div>

          {/* Roadmap strip — where this learner sits on the four-stage arc. */}
          <ol className="mt-6 flex flex-col gap-4 border-t border-dojo-border/50 pt-6 sm:flex-row sm:items-center">
            {JOURNEY_STAGES.map((stage, i) => {
              const reached = completedSessions.length >= stage.sessions;
              return (
                <li key={stage.title} className="flex flex-1 items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      reached
                        ? 'bg-dojo-accent text-white'
                        : 'border border-dojo-border bg-dojo-surface text-dojo-text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-xs font-bold ${reached ? 'text-dojo-text-primary' : 'text-dojo-text-muted'}`}>
                      {stage.title}
                    </span>
                    <span className="block text-[10px] text-dojo-text-muted">{stage.caption}</span>
                  </span>
                  {i < JOURNEY_STAGES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={`mx-1 hidden h-px flex-1 border-t border-dashed sm:block ${reached ? 'border-dojo-accent' : 'border-dojo-border'}`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Recent Achievements */}
        <Card className="!p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">Achievements</h3>
            <Link href="/progress" className="text-xs font-bold text-dojo-accent hover:underline">
              View All Badges
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-y-6">
            {achievements.map((a) => {
              const Icon = iconMap[a.icon] ?? Sparkles;
              return (
                <div key={a.id} className="flex flex-col items-center text-center">
                  <HexBadge icon={Icon} label={a.label} unlocked={a.unlocked} size={48} />
                  <span className={`mt-2 px-1 text-[9px] font-bold uppercase leading-tight tracking-tight ${a.unlocked ? 'text-dojo-text-primary' : 'text-dojo-text-muted'}`}>
                    {a.label}
                  </span>
                  <span className="mt-0.5 text-[9px] text-dojo-text-muted">
                    {a.unlockedAt ? formatBadgeDate(a.unlockedAt) : 'Locked'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex items-center gap-3 border-t border-dojo-border/50 pt-4">
            <Trophy className="h-4 w-4 shrink-0 text-dojo-warning" />
            <p className="shrink-0 text-[11px] font-semibold text-dojo-text-muted">
              You have unlocked {unlockedCount} of {achievements.length} badges
            </p>
            <ProgressBar
              value={Math.round((unlockedCount / achievements.length) * 100)}
              color="warning"
              size="sm"
              showLabel
              className="flex-1"
            />
          </div>
        </Card>
      </div>

      {/* ── Row 3: Recent Sessions ── */}
      <Card className="!p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-dojo-text-primary">Recent Sessions</h2>
          {!loading && sessions.length > 3 && (
            <Link href="/sessions">
              <Button variant="ghost" size="sm" className="h-8 text-xs font-bold">
                View Full History
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-[--radius-md] border border-dojo-border bg-dojo-surface/40 p-4">
                <div className="mb-3 h-4 w-16 rounded bg-dojo-border" />
                <div className="mb-2 h-4 w-3/4 rounded bg-dojo-border" />
                <div className="h-3 w-1/2 rounded bg-dojo-border" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-[--radius-md] border border-dashed border-dojo-border/60 py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dojo-surface-raised">
              <Play className="h-8 w-8 fill-current text-dojo-border" />
            </div>
            <p className="mb-1 font-bold text-dojo-text-primary">No practice sessions found</p>
            <p className="mx-auto mb-6 max-w-xs text-xs text-dojo-text-muted">Start your first role-play in the Dojo to build your history and track your progress.</p>
            <Button variant="primary" size="lg" onClick={() => router.push('/hub')}>
              <Sparkles className="h-4 w-4" /> Start Your First Session
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.slice(0, 3).map((session) => (
              <div
                key={session.id}
                className={`flex items-center gap-3 rounded-[--radius-md] border border-dojo-border bg-dojo-surface/40 p-3 transition-all hover:border-dojo-accent ${deleting === session.id ? 'opacity-50' : ''}`}
              >
                <Badge
                  variant={session.status === 'completed' ? 'success' : 'accent'}
                  className="shrink-0 text-[9px] uppercase tracking-tighter"
                >
                  {session.status === 'completed' ? 'Done' : 'Active'}
                </Badge>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-dojo-text-muted">
                  #{session.sessionNumber}
                </span>
                <Link href={`/sessions/${session.id}/report`} className="min-w-0 flex-1 group">
                  <p className="truncate text-sm font-bold text-dojo-text-primary group-hover:text-dojo-accent">
                    {session.scenarioTitle ?? `Session #${session.id}`}
                  </p>
                  <p className="truncate text-[11px] font-medium text-dojo-text-muted">
                    {formatDate(session.startedAt)} • {session.totalTurns} Turns
                  </p>
                </Link>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => handleShare(session.id)}
                    aria-label="Copy share link"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-dojo-text-muted transition-colors hover:bg-dojo-accent/10 hover:text-dojo-accent"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(session.id)}
                    aria-label="Delete session"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-dojo-text-muted transition-colors hover:bg-dojo-danger/10 hover:text-dojo-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
