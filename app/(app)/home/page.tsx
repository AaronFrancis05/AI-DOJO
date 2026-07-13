/* ───────────────────────────────────────────────
   Home Dashboard (Panel 01 + Sessions merged)
   Authenticated landing page — profile, stats, session history with share/delete/report
   Queries real data from the DB API.
   ─────────────────────────────────────────────── */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TrendValue } from '@/components/ui/TrendValue';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { HexBadge } from '@/components/ui/HexBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { sessionHistory as mockSessions } from '@/lib/data/sessions';
import { useUser } from '@/lib/auth/user-context';
import {
  ArrowRight,
  Flame,
  BookOpen,
  Clock,
  Target,
  Footprints,
  MessageSquare,
  PenTool,
  Globe,
  Sparkles,
  Zap,
  ExternalLink,
  Share2,
  Trash2,
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

// ── Types ──────────────────────────────────────────────

interface SessionRecord {
  id: number;
  scenarioId: number;
  sessionNumber: number;
  status: string;
  totalTurns: number;
  vocabularyScore: number | null;
  grammarScore: number | null;
  fluencyScore: number | null;
  culturalScore: number | null;
  taskScore: number | null;
  feedback: string | null;
  startedAt: string;
  completedAt: string | null;
  scenarioTitle?: string;
}

// ── Helpers ────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeTotalPct(s: SessionRecord): number | null {
  if (s.status !== 'completed' || s.vocabularyScore === null) return null;
  const sum = (s.vocabularyScore ?? 0) + (s.grammarScore ?? 0) + (s.fluencyScore ?? 0) + (s.culturalScore ?? 0) + (s.taskScore ?? 0);
  return Math.round((sum / 100) * 100);
}

// ── Icon map ──────────────────────────────────────────

const iconMap: Record<string, LucideIcon> = {
  Footprints,
  MessageSquare,
  BookOpen,
  Flame,
  PenTool,
  Globe,
};

// xp, tier, streak are now stored in the `users` table.
// Words learned / speaking time are still placeholders.

const weeklyActivity = [
  { day: 'Mon', minutes: 15 },
  { day: 'Tue', minutes: 22 },
  { day: 'Wed', minutes: 28 },
  { day: 'Thu', minutes: 10 },
  { day: 'Fri', minutes: 35 },
  { day: 'Sat', minutes: 42 },
  { day: 'Sun', minutes: 8 },
];

const recentAchievements = [
  { id: '1', icon: 'Footprints', label: 'First Steps', unlocked: true },
  { id: '2', icon: 'MessageSquare', label: '10 Conversations', unlocked: true },
  { id: '3', icon: 'BookOpen', label: '50 Words', unlocked: true },
  { id: '4', icon: 'Flame', label: '7-Day Streak', unlocked: false },
  { id: '5', icon: 'PenTool', label: 'Perfect Grammar', unlocked: false },
  { id: '6', icon: 'Globe', label: 'All Domains', unlocked: false },
];

// ── Home Page ─────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const user = useUser();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<number | null>(null);

  // Load sessions from DB via API
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        if (data.success && data.sessions.length > 0) {
          setSessions(data.sessions);
        } else {
          // Fallback: use mock data if DB not seeded
          setSessions(mockSessions.map(s => ({
            ...s,
            scenarioTitle: s.scenarioTitle,
          })) as any);
        }
      } catch (e) {
        console.error('Failed to load sessions:', e);
        setSessions(mockSessions.map(s => ({
          ...s,
          scenarioTitle: s.scenarioTitle,
        })) as any);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Share a session
  async function handleShare(sessionId: number) {
    if (sharing[sessionId]) {
      navigator.clipboard.writeText(sharing[sessionId]).catch(() => {});
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
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
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
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

  const activeSession = sessions.find((s) => s.status === 'active');
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const totalScore = completedSessions.reduce((sum, s) => {
    const pct = computeTotalPct(s);
    return sum + (pct ?? 0);
  }, 0);
  const avgScore = completedSessions.length > 0 ? Math.round(totalScore / completedSessions.length) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header with Profile */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name ?? 'Learner'} size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-dojo-text-primary">Welcome back, {user?.name ?? 'Learner'}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <Badge variant={(user?.level ?? 'beginner') as any}>{user?.level ?? 'beginner'}</Badge>
              <span className="text-xs text-dojo-text-muted">{user?.email ?? ''}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => router.push('/hub')}>
            <Sparkles className="h-4 w-4" />
            New Practice
          </Button>
        </div>
      </div>

      {/* Live session banner */}
      {activeSession && (
        <Link href={`/session/${activeSession.id}`} suppressHydrationWarning>
          <Card className="border-dojo-danger/30 !p-4 cursor-pointer hover:bg-dojo-surface transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LiveBadge />
                <div>
                  <p className="text-sm font-semibold text-dojo-text-primary">
                    Roleplay in Progress · {activeSession.scenarioTitle ?? `Session #${activeSession.sessionNumber}`}
                  </p>
                  <p className="text-xs text-dojo-text-muted">
                    Turn {activeSession.totalTurns}
                  </p>
                </div>
              </div>
              <Button variant="primary" size="sm">
                Resume
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </Link>
      )}

      {/* Row 1: Statistics + Weekly Activity + Streak */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Statistics Card — Profile data */}
        <Card className="lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">Statistics</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-dojo-text-muted">Total Sessions</p>
              <TrendValue value={sessions.length} trend="up" trendLabel={`+${completedSessions.length}`} />
            </div>
            <div>
              <p className="text-xs text-dojo-text-muted">Speaking Time</p>
              <TrendValue value="-" trend="neutral" />
            </div>
            <div>
              <p className="text-xs text-dojo-text-muted">Avg. Score</p>
              <TrendValue value={avgScore ? `${avgScore}%` : '-'} trend={avgScore && avgScore > 0 ? 'up' : 'neutral'} />
            </div>
            <div>
              <p className="text-xs text-dojo-text-muted">New Words</p>
              <TrendValue value="-" trend="neutral" />
            </div>
          </div>
        </Card>

        {/* Weekly Activity Chart */}
        <Card className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">Weekly Activity</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1C2A42" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#8A93A8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: '#111D33', border: '1px solid #1C2A42', borderRadius: 8, color: '#F4F4F8' }}
                  formatter={(value: any) => [`${value} min`, 'Practice Time']}
                />
                <Bar dataKey="minutes" fill="#2D3BC5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Right column: Streak + Quick Links */}
        <div className="space-y-4">
          {/* Streak Card */}
          <Card>
            <div className="flex items-center gap-3">
              <Flame className="h-8 w-8 text-dojo-streak" />
              <div>
                <p className="text-lg font-bold text-dojo-text-primary">{user?.streak ?? 0} Day Streak</p>
                <p className="text-xs text-dojo-text-muted">Best: {user?.streak ?? 0} days</p>
              </div>
            </div>
            <div className="mt-3 flex gap-1.5">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div
                  key={i}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium
                    ${i < (user?.streak ?? 0) ? 'bg-dojo-streak text-black' : 'bg-dojo-border text-dojo-text-muted'}`}
                >
                  {d}
                </div>
              ))}
            </div>
          </Card>

          {/* Quick links card */}
          <Card hoverable onClick={() => router.push('/hub')} className="cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent/10">
                <Target className="h-4 w-4 text-dojo-accent" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-dojo-text-primary">Choose a Scenario</p>
                <p className="text-xs text-dojo-text-muted">Explore all domains and situations</p>
              </div>
              <ArrowRight className="h-4 w-4 text-dojo-text-muted" />
            </div>
          </Card>
        </div>
      </div>

      {/* Row 2: Achievements + Learning Tip + Continue Journey */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Continue Journey Card */}
        <Card hoverable className="lg:col-span-1 cursor-pointer" onClick={() => router.push('/hub')}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dojo-accent">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-dojo-text-primary">Continue Your Journey</p>
              <p className="mt-1 text-xs text-dojo-text-muted leading-relaxed">
                Pick up where you left off. Browse domains and situations to continue practicing.
              </p>
              <ProgressBar value={completedSessions.length > 0 ? Math.min(100, Math.round((completedSessions.length / 12) * 100)) : 0} color="accent" size="sm" className="mt-3" showLabel />
            </div>
          </div>
        </Card>

        {/* Recent Achievements */}
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">Achievements</h3>
            <span className="text-xs text-dojo-text-muted">
              {recentAchievements.filter((a) => a.unlocked).length}/{recentAchievements.length}
            </span>
          </div>
          <div className="flex justify-around">
            {recentAchievements.slice(0, 6).map((a) => {
              const Icon = iconMap[a.icon] ?? Sparkles;
              return (
                <HexBadge
                  key={a.id}
                  icon={Icon}
                  label={a.label}
                  unlocked={a.unlocked}
                  size={40}
                />
              );
            })}
          </div>
        </Card>

        {/* Learning Tip Card */}
        <Card className="lg:col-span-1">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-success/10">
              <Zap className="h-4 w-4 text-dojo-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-dojo-text-primary">Learning Tip</p>
              <p className="mt-1 text-xs text-dojo-text-muted leading-relaxed">
                Try the &quot;Handle a Complaint&quot; scenario in Trouble Mode
                for a real challenge — it pushes your keigo and problem-solving skills.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 3: Recent Sessions (from DB) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-dojo-text-primary">
            Recent Sessions
            {loading && <span className="ml-2 text-xs text-dojo-text-muted animate-pulse">Loading...</span>}
          </h2>
          {!loading && sessions.length > 3 && (
            <Link href="/sessions">
              <Button variant="ghost" size="sm">
                View All ({sessions.length})
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>

        {!loading && sessions.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-dojo-text-muted mb-2">No sessions yet</p>
            <p className="text-xs text-dojo-text-muted">Start your first role-play from the Hub</p>
            <Button variant="primary" size="sm" className="mt-4" onClick={() => router.push('/hub')}>
              <Sparkles className="h-4 w-4" /> Start Practicing
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {(loading ? mockSessions.slice(0, 3) : sessions.slice(0, 3)).map((session) => {
              const pct = computeTotalPct(session as SessionRecord);

              return (
                <Card key={session.id} hoverable className={`!p-4 ${deleting === session.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={session.status === 'active' ? 'accent' : 'default'}>
                          {session.status === 'active' ? 'In Progress' : 'Completed'}
                        </Badge>
                        {session.status === 'active' && <LiveBadge />}
                        <span className="text-xs text-dojo-text-muted">
                          Attempt #{session.sessionNumber}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-dojo-text-primary truncate">
                        {(session as any).scenarioTitle ?? `Session #${session.id}`}
                      </p>
                      <p className="text-xs text-dojo-text-muted mt-0.5">
                        {formatDate(session.startedAt)} · {session.totalTurns} turns
                        {session.completedAt && ` · Completed ${formatDate(session.completedAt)}`}
                      </p>
                      {pct !== null && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-dojo-text-muted">Score:</span>
                          <span className="text-xs font-semibold text-dojo-success">{pct}%</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {/* View Report */}
                      <Link href={`/sessions/${session.id}/report`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                          Report
                        </Button>
                      </Link>

                      {/* Share */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleShare(session.id); }}
                      >
                        <Share2 className="h-4 w-4" />
                        {sharing[session.id] ? 'Copied' : 'Share'}
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-dojo-danger hover:text-dojo-danger"
                        onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                        disabled={deleting === session.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
