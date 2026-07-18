'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RadarChart, type RadarDataPoint } from '@/components/ui/RadarChart';
import { getUserStats, getWeeklyActivity, type WeeklyActivity } from '@/lib/data/sessions';
import { useUser } from '@/lib/auth/user-context';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  ArrowUp,
  Clock,
  BookOpen,
  Target,
  TrendingUp,
} from 'lucide-react';

const radarData: RadarDataPoint[] = [
  { label: 'Grammar',   value: 90 },
  { label: 'Vocabulary', value: 88 },
  { label: 'Fluency',   value: 76 },
  { label: 'Culture',   value: 72 },
  { label: 'Task',      value: 85 },
];

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'skills', label: 'Skills' },
  { id: 'activity', label: 'Activity' },
  { id: 'comparisons', label: 'Comparisons' },
];

const monthlyData = [
  { month: 'Sep', score: 62 },
  { month: 'Oct', score: 68 },
  { month: 'Nov', score: 71 },
  { month: 'Dec', score: 74 },
  { month: 'Jan', score: 78 },
  { month: 'Feb', score: 82 },
];

export default function ProgressPage() {
  const user = useUser();
  const [stats, setStats] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [statsRes, weeklyRes] = await Promise.all([
        getUserStats(),
        getWeeklyActivity(),
      ]);
      setStats(statsRes.stats);
      setWeeklyData(weeklyRes.data);
      setLoading(false);
    }
    load();
  }, []);

  const displayXP = stats?.xp ?? user?.xp ?? 0;
  const displaySessions = stats?.totalSessions ?? 0;
  const displayCompleted = stats?.completedSessions ?? 0;
  const displayStreak = stats?.streak ?? user?.streak ?? 0;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Progress</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Track your learning journey across all domains
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-dojo-text-muted animate-pulse">
          Loading stats...
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent/10">
                  <TrendingUp className="h-4 w-4 text-dojo-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-dojo-text-muted">Total XP</p>
                  <p className="text-lg font-bold text-dojo-text-primary">{displayXP}</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent/10">
                  <Target className="h-4 w-4 text-dojo-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-dojo-text-muted">Sessions</p>
                  <p className="text-lg font-bold text-dojo-text-primary">{displayCompleted}</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent/10">
                  <Clock className="h-4 w-4 text-dojo-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-dojo-text-muted">Total Sessions</p>
                  <p className="text-lg font-bold text-dojo-text-primary">{displaySessions}</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent/10">
                  <BookOpen className="h-4 w-4 text-dojo-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-dojo-text-muted">Streak</p>
                  <p className="text-lg font-bold text-dojo-text-primary">{displayStreak} days</p>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <Tabs tabs={tabs} renderPanel={(tabId) => {
              switch (tabId) {
                case 'overview':
                  return <OverviewTab />;
                case 'skills':
                  return <SkillsTab />;
                case 'activity':
                  return <ActivityTab weeklyData={weeklyData} />;
                case 'comparisons':
                  return <ComparisonsTab />;
                default:
                  return null;
              }
            }} />
          </Card>
        </>
      )}
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-4">Skills Overview</h3>
        <div className="max-w-full overflow-hidden flex justify-center">
          <RadarChart data={radarData} size={Math.min(280, typeof window !== 'undefined' ? window.innerWidth - 96 : 280)} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-4">Monthly Progress</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C2A42" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#8A93A8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#8A93A8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#111D33', border: '1px solid #1C2A42', borderRadius: 8, color: '#F4F4F8' }} />
              <Line type="monotone" dataKey="score" stroke="#2D3BC5" strokeWidth={2} dot={{ fill: '#2D3BC5', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function SkillsTab() {
  const skills = [
    { label: 'Grammar', score: 90, change: '+5', desc: 'Particle usage and sentence structure' },
    { label: 'Vocabulary', score: 88, change: '+3', desc: 'Word variety and contextual accuracy' },
    { label: 'Fluency', score: 76, change: '+8', desc: 'Response speed and natural flow' },
    { label: 'Culture', score: 72, change: '+2', desc: 'Politeness levels and customs' },
    { label: 'Task', score: 85, change: '+6', desc: 'Goal completion rate' },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="max-w-full overflow-hidden flex justify-center">
        <RadarChart data={radarData} size={Math.min(240, typeof window !== 'undefined' ? window.innerWidth - 96 : 240)} />
      </div>
      <div className="space-y-4">
        {skills.map((skill) => (
          <div key={skill.label} className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-dojo-text-primary">{skill.label}</span>
                <span className="text-sm font-semibold text-dojo-text-primary">{skill.score}</span>
              </div>
              <ProgressBar value={skill.score} color="accent" size="sm" className="mt-1" />
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-[10px] text-dojo-text-muted">{skill.desc}</span>
                <span className="text-[10px] text-dojo-success flex items-center gap-0.5">
                  <ArrowUp className="h-2.5 w-2.5" />{skill.change}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTab({ weeklyData }: { weeklyData: WeeklyActivity[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-dojo-text-muted uppercase tracking-wider mb-4">Weekly Activity</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyData} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1C2A42" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: '#8A93A8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#8A93A8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: '#111D33', border: '1px solid #1C2A42', borderRadius: 8, color: '#F4F4F8' }} />
            <Bar dataKey="minutes" fill="#2D3BC5" radius={[4, 4, 0, 0]} name="Minutes" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ComparisonsTab() {
  return (
    <div className="text-center py-12">
      <p className="text-dojo-text-muted">
        Compare your progress with peers, friends, or class averages.
      </p>
      <p className="text-xs text-dojo-text-muted mt-2">
        Coming soon — this feature is in development.
      </p>
    </div>
  );
}
