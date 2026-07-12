/* ───────────────────────────────────────────────
   Home Dashboard (Panel 01)
   Authenticated landing page — full page with all cards
   ─────────────────────────────────────────────── */

'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TrendValue } from '@/components/ui/TrendValue';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { HexBadge } from '@/components/ui/HexBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  userStats,
  weeklyActivity,
  recentAchievements,
  sessionHistory,
} from '@/lib/mock-data/sessions';
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

const iconMap: Record<string, LucideIcon> = {
  Footprints,
  MessageSquare,
  BookOpen,
  Flame,
  PenTool,
  Globe,
};

export default function HomePage() {
  const activeSession = sessionHistory.find((s) => s.status === 'active');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dojo-text-primary">Welcome back, Alex</h1>
          <p className="text-sm text-dojo-text-muted">Continue your Japanese journey</p>
        </div>
        <Button variant="primary" size="md">
          <Sparkles className="h-4 w-4" />
          Quick Practice
        </Button>
      </div>

      {/* Live session banner */}
      {activeSession && (
        <Card className="border-dojo-danger/30 !p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LiveBadge />
              <div>
                <p className="text-sm font-semibold text-dojo-text-primary">
                  Roleplay in Progress · {activeSession.scenarioTitle}
                </p>
                <p className="text-xs text-dojo-text-muted">
                  Turn {activeSession.totalTurns} · Started {new Date(activeSession.startedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
            <Button variant="primary" size="sm">
              Resume
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Row 1: Statistics + Weekly Activity + Upcoming + Streak */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Statistics Card */}
        <Card className="lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">Statistics</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-dojo-text-muted">Total Sessions</p>
              <TrendValue value={userStats.totalSessions} trend="up" trendLabel={`+${userStats.completedSessions}`} />
            </div>
            <div>
              <p className="text-xs text-dojo-text-muted">Speaking Time</p>
              <TrendValue value={`${userStats.totalSpeakingTime}m`} trend="up" trendLabel="+12m" />
            </div>
            <div>
              <p className="text-xs text-dojo-text-muted">Avg. Accuracy</p>
              <TrendValue value={`${userStats.averageAccuracy}%`} trend="up" trendLabel="+5%" />
            </div>
            <div>
              <p className="text-xs text-dojo-text-muted">New Words</p>
              <TrendValue value={userStats.newWordsLearned} trend="up" trendLabel="+12" />
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
                  formatter={(value) => [`${value} min`, 'Practice Time']}
                />
                <Bar dataKey="minutes" fill="#2D3BC5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Right column: Upcoming + Streak */}
        <div className="space-y-4">
          {/* Upcoming Session */}
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent/10">
                <Clock className="h-4 w-4 text-dojo-accent" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-dojo-text-muted">Next Session</p>
                <p className="text-sm font-semibold text-dojo-text-primary">Order at the Counter</p>
                <p className="text-xs text-dojo-text-muted">Today · 2:00 PM</p>
              </div>
              <Badge variant="beginner">Beginner</Badge>
            </div>
          </Card>

          {/* Streak Card */}
          <Card>
            <div className="flex items-center gap-3">
              <Flame className="h-8 w-8 text-dojo-streak" />
              <div>
                <p className="text-lg font-bold text-dojo-text-primary">{userStats.currentStreak} Day Streak</p>
                <p className="text-xs text-dojo-text-muted">Best: {userStats.longestStreak} days</p>
              </div>
            </div>
            {/* Day dots */}
            <div className="mt-3 flex gap-1.5">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div
                  key={i}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium
                    ${i < userStats.currentStreak ? 'bg-dojo-streak text-black' : 'bg-dojo-border text-dojo-text-muted'}`}
                >
                  {d}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Row 2: Continue Journey + Achievements + Learning Tip */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Continue Journey Card */}
        <Card hoverable className="lg:col-span-1">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dojo-accent">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-dojo-text-primary">Continue Your Journey</p>
              <p className="mt-1 text-xs text-dojo-text-muted leading-relaxed">
                Pick up where you left off in the Restaurant domain.
                You&apos;re 60% through the &quot;Order at the Counter&quot; series.
              </p>
              <ProgressBar value={60} color="accent" size="sm" className="mt-3" showLabel />
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

      {/* Row 3: Recent Sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-dojo-text-primary">Recent Sessions</h2>
          <Button variant="ghost" size="sm">
            View All <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessionHistory.slice(0, 6).map((session) => (
            <Card key={session.id} hoverable>
              <div className="flex items-center justify-between mb-2">
                <Badge variant={session.status === 'active' ? 'accent' : 'default'}>
                  {session.status === 'active' ? 'In Progress' : 'Completed'}
                </Badge>
                {session.status === 'active' && <LiveBadge />}
              </div>
              <p className="text-sm font-semibold text-dojo-text-primary">{session.scenarioTitle}</p>
              <p className="text-xs text-dojo-text-muted mt-1">
                {new Date(session.startedAt).toLocaleDateString()} · {session.totalTurns} turns
              </p>
              {session.status === 'completed' && session.vocabularyScore !== null && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-dojo-text-muted">Score:</span>
                  <span className="text-xs font-semibold text-dojo-success">
                    {Math.round(
                      ((session.vocabularyScore + (session.grammarScore ?? 0) +
                        (session.fluencyScore ?? 0) + (session.culturalScore ?? 0) +
                        (session.taskScore ?? 0)) /
                        ((session.vocabularyScore ?? 0) !== 0 ? 5 : 1)) *
                        10
                    )}%
                  </span>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
