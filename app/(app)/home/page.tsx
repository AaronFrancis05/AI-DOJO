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
  Trophy,
  History,
  Layout,
  Play,
  TrendingUp,
  Award,
  Calendar,
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
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-10">
      {/* ── Top Section: Profile Hero ── */}
      <div className="relative overflow-hidden rounded-3xl bg-dojo-surface-raised border border-dojo-border p-8 shadow-2xl">
        {/* Background glow effects */}
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-dojo-accent/10 blur-[80px]" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-dojo-success/10 blur-[80px]" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-dojo-accent to-dojo-success blur opacity-30 animate-pulse" />
              <Avatar name={user?.name ?? 'Learner'} size="xl" className="relative border-4 border-dojo-surface shadow-2xl" />
              <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-dojo-accent text-white shadow-lg border-2 border-dojo-surface">
                <Trophy className="h-4 w-4" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-dojo-text-primary tracking-tight">Okaeri, {user?.name ?? 'Learner'}!</h1>
                <Badge variant="premium" className="px-3 py-1 text-[10px] tracking-widest uppercase">Premium</Badge>
              </div>
              <p className="mt-1 text-dojo-text-muted">Master of 12 real-world situations. 85% fluency goal reached.</p>
              
              <div className="flex items-center gap-4 mt-4">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-dojo-text-muted font-bold">Level</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-dojo-accent">Level 4</span>
                    <Badge variant="intermediate">Intermediate</Badge>
                  </div>
                </div>
                <div className="h-10 w-px bg-dojo-border mx-2" />
                <div className="flex flex-col flex-1 min-w-[120px]">
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-dojo-text-muted font-bold mb-1">
                    <span>Progress to Level 5</span>
                    <span>{user?.xp ?? 2400}/{user?.xpToNext ?? 3000} XP</span>
                  </div>
                  <ProgressBar value={Math.round(((user?.xp ?? 2400) / (user?.xpToNext ?? 3000)) * 100)} color="accent" size="md" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4">
            <Card className="!p-3 !bg-dojo-surface/50 border-dojo-border/50 backdrop-blur-sm min-w-[100px] text-center">
              <Flame className="mx-auto h-5 w-5 text-dojo-streak mb-1" />
              <p className="text-xl font-black text-dojo-text-primary">{user?.streak ?? 12}</p>
              <p className="text-[10px] uppercase tracking-tighter text-dojo-text-muted font-bold">Day Streak</p>
            </Card>
            <Card className="!p-3 !bg-dojo-surface/50 border-dojo-border/50 backdrop-blur-sm min-w-[100px] text-center">
              <Target className="mx-auto h-5 w-5 text-dojo-accent mb-1" />
              <p className="text-xl font-black text-dojo-text-primary">85%</p>
              <p className="text-[10px] uppercase tracking-tighter text-dojo-text-muted font-bold">Accuracy</p>
            </Card>
            <Card className="!p-3 !bg-dojo-surface/50 border-dojo-border/50 backdrop-blur-sm min-w-[100px] text-center">
              <Zap className="mx-auto h-5 w-5 text-dojo-warning mb-1" />
              <p className="text-xl font-black text-dojo-text-primary">2.4k</p>
              <p className="text-[10px] uppercase tracking-tighter text-dojo-text-muted font-bold">Total XP</p>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Row 1: Daily Goal + Live Session + Weekly Activity ── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left column: Goals & Quick Actions (4 cols) */}
        <div className="lg:col-span-4 space-y-8">
          {/* Daily Goal Card */}
          <Card className="relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Award className="h-16 w-16" />
            </div>
            <h3 className="text-xs font-bold text-dojo-text-muted uppercase tracking-widest mb-4">Daily Goal</h3>
            <div className="flex items-end justify-between mb-2">
              <p className="text-2xl font-black text-dojo-text-primary">24 / 30 <span className="text-sm font-medium text-dojo-text-muted">mins</span></p>
              <span className="text-xs font-bold text-dojo-success">80%</span>
            </div>
            <ProgressBar value={80} color="success" size="lg" className="mb-4" />
            <p className="text-xs text-dojo-text-muted leading-relaxed">You&apos;re almost there! Complete one more roleplay session to hit your daily target.</p>
            <Button variant="primary" className="w-full mt-6 shadow-lg shadow-dojo-accent/20" onClick={() => router.push('/hub')}>
              <Play className="h-4 w-4 fill-current" /> Continue Practice
            </Button>
          </Card>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="!p-4 text-center hover:border-dojo-accent/50 transition-colors cursor-pointer" onClick={() => router.push('/leaderboard')}>
              <TrendingUp className="mx-auto h-5 w-5 text-dojo-success mb-2" />
              <p className="text-lg font-bold text-dojo-text-primary">#14</p>
              <p className="text-[10px] uppercase text-dojo-text-muted font-bold">Global Rank</p>
            </Card>
            <Card className="!p-4 text-center hover:border-dojo-accent/50 transition-colors cursor-pointer">
              <Calendar className="mx-auto h-5 w-5 text-dojo-accent mb-2" />
              <p className="text-lg font-bold text-dojo-text-primary">Jul 15</p>
              <p className="text-[10px] uppercase text-dojo-text-muted font-bold">Next Milestone</p>
            </Card>
          </div>
        </div>

        {/* Center/Right column: Activity & Sessions (8 cols) */}
        <div className="lg:col-span-8 space-y-8">
          {/* Weekly Activity & Live Session */}
          <div className="space-y-6">
            {/* Live session banner merged here */}
            {activeSession && (
              <Link href={`/session/${activeSession.id}`} suppressHydrationWarning>
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-dojo-danger/20 to-dojo-accent/10 border border-dojo-danger/30 p-5 group cursor-pointer hover:shadow-xl transition-all">
                  <div className="absolute top-0 right-0 p-2">
                    <div className="h-2 w-2 rounded-full bg-dojo-danger animate-ping" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dojo-danger/20 text-dojo-danger">
                        <Play className="h-6 w-6 fill-current" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-dojo-danger">Live Session</span>
                          <LiveBadge />
                        </div>
                        <p className="text-lg font-bold text-dojo-text-primary">
                          {activeSession.scenarioTitle ?? `Session #${activeSession.sessionNumber}`}
                        </p>
                        <p className="text-xs text-dojo-text-muted">Turn {activeSession.totalTurns} • Continue your conversation with Hana</p>
                      </div>
                    </div>
                    <Button variant="primary" size="sm" className="bg-dojo-danger hover:bg-dojo-danger/90">
                      Resume Now
                    </Button>
                  </div>
                </div>
              </Link>
            )}

            <Card className="!p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xs font-bold text-dojo-text-muted uppercase tracking-widest">Weekly Activity</h3>
                  <p className="text-lg font-bold text-dojo-text-primary mt-1">158 Total Minutes <span className="text-xs font-normal text-dojo-success ml-2">+12% vs last week</span></p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-[10px]">Last 7 Days</Badge>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyActivity} barCategoryGap="30%">
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2D3BC5" stopOpacity={1} />
                        <stop offset="100%" stopColor="#2D3BC5" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1C2A42" vertical={false} opacity={0.5} />
                    <XAxis dataKey="day" tick={{ fill: '#8A93A8', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'rgba(45, 59, 197, 0.05)' }}
                      contentStyle={{ background: '#080C18', border: '1px solid #1C2A42', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: '#F4F4F8', fontSize: 12, fontWeight: 700 }}
                    />
                    <Bar dataKey="minutes" fill="url(#barGradient)" radius={[6, 6, 2, 2]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Row 2: Learning Journey & Achievements ── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Learning Journey */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold text-dojo-text-muted uppercase tracking-widest">Learning Journey</h3>
            <Button variant="ghost" size="sm" className="text-xs font-bold" onClick={() => router.push('/progress')}>
              View Roadmap <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative overflow-hidden rounded-xl border border-dojo-border bg-dojo-surface/40 p-4 group hover:border-dojo-accent transition-all cursor-pointer">
              <div className="absolute top-0 left-0 h-1 w-full bg-dojo-accent" />
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dojo-accent/20 text-dojo-accent">
                  <Layout className="h-4 w-4" />
                </div>
                <p className="text-sm font-bold text-dojo-text-primary">Social Situations</p>
                <Badge variant="accent" className="ml-auto text-[9px]">In Progress</Badge>
              </div>
              <p className="text-[11px] text-dojo-text-muted mb-3 leading-relaxed">Mastering introductions and small talk in various social settings.</p>
              <div className="flex items-center justify-between text-[10px] font-bold text-dojo-text-muted mb-1">
                <span>8 / 12 Situations</span>
                <span>66%</span>
              </div>
              <ProgressBar value={66} color="accent" size="sm" />
            </div>

            <div className="relative overflow-hidden rounded-xl border border-dojo-border bg-dojo-surface/40 p-4 group hover:border-dojo-success transition-all cursor-pointer">
              <div className="absolute top-0 left-0 h-1 w-full bg-dojo-success" />
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dojo-success/20 text-dojo-success">
                  <Globe className="h-4 w-4" />
                </div>
                <p className="text-sm font-bold text-dojo-text-primary">Travel Essentials</p>
                <Badge variant="success" className="ml-auto text-[9px]">Completed</Badge>
              </div>
              <p className="text-[11px] text-dojo-text-muted mb-3 leading-relaxed">Booking hotels, asking directions, and navigating airports with ease.</p>
              <div className="flex items-center justify-between text-[10px] font-bold text-dojo-text-muted mb-1">
                <span>10 / 10 Situations</span>
                <span>100%</span>
              </div>
              <ProgressBar value={100} color="success" size="sm" />
            </div>
          </div>
        </Card>

        {/* Recent Achievements */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold text-dojo-text-muted uppercase tracking-widest">Achievements</h3>
            <span className="text-xs font-bold text-dojo-text-muted">{recentAchievements.filter(a => a.unlocked).length}/{recentAchievements.length}</span>
          </div>
          <div className="grid grid-cols-3 gap-y-6">
            {recentAchievements.map((a) => {
              const Icon = iconMap[a.icon] ?? Sparkles;
              return (
                <div key={a.id} className="flex flex-col items-center group cursor-pointer">
                  <HexBadge
                    icon={Icon}
                    label={a.label}
                    unlocked={a.unlocked}
                    size={48}
                  />
                  <span className={`mt-2 text-[9px] font-bold uppercase tracking-tight text-center px-1 transition-colors ${a.unlocked ? 'text-dojo-text-primary' : 'text-dojo-text-muted group-hover:text-dojo-text-primary'}`}>
                    {a.label}
                  </span>
                </div>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" className="w-full mt-6 text-[10px] font-bold border border-dojo-border/50">
            View All Badges
          </Button>
        </Card>
      </div>

      {/* ── Row 3: History & Recent Sessions ── */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-dojo-accent" />
            <h2 className="text-xl font-bold text-dojo-text-primary">Recent Sessions</h2>
          </div>
          <div className="flex gap-2">
            {!loading && sessions.length > 3 && (
              <Link href="/sessions">
                <Button variant="ghost" size="sm" className="text-xs font-bold h-8">
                  View Full History
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {!loading && sessions.length === 0 ? (
          <Card className="text-center py-12 border-dashed border-dojo-border/60">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-dojo-surface-raised mx-auto mb-4">
              <Play className="h-8 w-8 text-dojo-border fill-current" />
            </div>
            <p className="text-dojo-text-primary font-bold mb-1">No practice sessions found</p>
            <p className="text-xs text-dojo-text-muted max-w-xs mx-auto mb-6">Start your first role-play in the Dojo to build your history and track your progress.</p>
            <Button variant="primary" size="lg" onClick={() => router.push('/hub')}>
              <Sparkles className="h-4 w-4" /> Start Your First Session
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(loading ? mockSessions.slice(0, 3) : sessions.slice(0, 3)).map((session) => {
              const pct = computeTotalPct(session as SessionRecord);

              return (
                <Card key={session.id} hoverable className={`group !p-5 relative transition-all hover:translate-y-[-2px] ${deleting === session.id ? 'opacity-50' : ''}`}>
                  <div className="absolute top-0 right-0 p-4 flex gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleShare(session.id); }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-dojo-surface-raised text-dojo-text-muted hover:text-dojo-accent hover:bg-dojo-accent/10 transition-colors"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-dojo-surface-raised text-dojo-text-muted hover:text-dojo-danger hover:bg-dojo-danger/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-4">
                      {session.status === 'active' ? (
                        <Badge variant="accent" className="text-[9px] uppercase tracking-tighter">Active</Badge>
                      ) : (
                        <Badge variant="success" className="text-[9px] uppercase tracking-tighter">Done</Badge>
                      )}
                      <span className="text-[10px] font-bold text-dojo-text-muted uppercase tracking-widest">#{session.sessionNumber}</span>
                    </div>

                    <h4 className="text-sm font-bold text-dojo-text-primary group-hover:text-dojo-accent transition-colors line-clamp-1">
                      {(session as any).scenarioTitle ?? `Session #${session.id}`}
                    </h4>
                    <p className="text-[11px] text-dojo-text-muted mt-1 font-medium">
                      {formatDate(session.startedAt)} • {session.totalTurns} Turns
                    </p>

                    <div className="mt-auto pt-6 flex items-center justify-between border-t border-dojo-border/50 mt-6">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-dojo-text-muted">Fluency:</span>
                        <span className={`text-xs font-black ${pct && pct > 80 ? 'text-dojo-success' : 'text-dojo-warning'}`}>{pct ? `${pct}%` : '-'}</span>
                      </div>
                      <Link href={`/sessions/${session.id}/report`}>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 font-bold hover:bg-dojo-accent/10">
                          Review Report <ExternalLink className="ml-1.5 h-3 w-3" />
                        </Button>
                      </Link>
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
