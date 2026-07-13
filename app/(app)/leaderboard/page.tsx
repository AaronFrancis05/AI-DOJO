/* ───────────────────────────────────────────────
   Leaderboard (Panel 10)
   Tabs: Global / Friends / School + Your rank card
   isCurrentUser computed from the real authenticated user's id.
   ─────────────────────────────────────────────── */

'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { leaderboardGlobal, leaderboardFriends } from '@/lib/data/sessions';
import { useUser } from '@/lib/auth/user-context';
import { Trophy, Medal, Flame } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/mock-data/sessions';

const tabs: Tab[] = [
  { id: 'global', label: 'Global' },
  { id: 'friends', label: 'Friends' },
  { id: 'school', label: 'School' },
];

function markCurrentUser(data: LeaderboardEntry[], currentUserId?: string): LeaderboardEntry[] {
  return data.map((e) => ({ ...e, isCurrentUser: !!currentUserId && e.userId === currentUserId }));
}

export default function LeaderboardPage() {
  const user = useUser();
  const globalData = markCurrentUser(leaderboardGlobal, user?.id);
  const friendsData = markCurrentUser(leaderboardFriends, user?.id);
  const currentUser = globalData.find((e) => e.isCurrentUser);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Leaderboard</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          See where you stand among learners
        </p>
      </div>

      {/* Your Rank Card */}
      {currentUser && (
        <Card raised className="mb-6 !p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dojo-accent text-lg font-bold text-white">
                #{currentUser.rank}
              </div>
              <Avatar name={currentUser.name} size="lg" />
              <div>
                <p className="text-base font-semibold text-dojo-text-primary">{currentUser.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <Badge variant="accent">Level {currentUser.level}</Badge>
                  <span className="text-xs text-dojo-text-muted">{currentUser.xp} XP</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-dojo-text-primary">
                {currentUser.averageScore}%
              </p>
              <p className="text-xs text-dojo-text-muted">Avg. Score</p>
              <div className="flex items-center gap-1 mt-1 justify-end">
                <Flame className="h-3 w-3 text-dojo-streak" />
                <span className="text-xs text-dojo-text-muted">{currentUser.streak} day streak</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Leaderboard Tabs */}
      <Card>
        <Tabs
          tabs={tabs}
          renderPanel={(tabId) => {
            const data = tabId === 'friends' ? friendsData : globalData;
            return <LeaderboardTable data={data} />;
          }}
        />
      </Card>
    </div>
  );
}

function LeaderboardTable({ data }: { data: LeaderboardEntry[] }) {
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-dojo-warning" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-dojo-text-muted" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-dojo-streak" />;
    return null;
  };

  return (
    <div className="divide-y divide-dojo-border">
      {data.map((entry) => (
        <div
          key={entry.userId}
          className={`flex items-center gap-4 px-4 py-3.5 transition-colors ${
            entry.isCurrentUser ? 'bg-dojo-accent/5' : 'hover:bg-dojo-surface'
          }`}
        >
          {/* Rank */}
          <div className="flex w-8 items-center justify-center">
            {getRankIcon(entry.rank) ?? (
              <span className="text-sm font-medium text-dojo-text-muted">#{entry.rank}</span>
            )}
          </div>

          {/* Avatar + Name */}
          <Avatar name={entry.name} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dojo-text-primary truncate">
              {entry.name}
              {entry.isCurrentUser && (
                <span className="ml-2 text-[10px] text-dojo-accent">(You)</span>
              )}
            </p>
            <p className="text-xs text-dojo-text-muted">Level {entry.level} · {entry.xp} XP</p>
          </div>

          {/* Stats */}
          <div className="text-right">
            <p className="text-sm font-semibold text-dojo-text-primary">{entry.averageScore}%</p>
            <p className="text-xs text-dojo-text-muted">{entry.sessionsCompleted} sessions</p>
          </div>

          {/* Streak */}
          <div className="flex items-center gap-1 text-xs text-dojo-text-muted min-w-[60px]">
            <Flame className="h-3 w-3 text-dojo-streak" />
            {entry.streak}
          </div>
        </div>
      ))}
    </div>
  );
}
