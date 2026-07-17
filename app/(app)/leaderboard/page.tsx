'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { getLeaderboardGlobal } from '@/lib/data/sessions';
import { useUser } from '@/lib/auth/user-context';
import { skillLevelBadgeClass, type SkillLevel } from '@/lib/design-tokens';
import { Trophy, Medal, Flame } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  level: string;
  xp: number;
  sessionsCompleted: number;
  averageScore: number;
  streak: number;
  isCurrentUser: boolean;
}

const tabs: Tab[] = [
  { id: 'global', label: 'Global' },
  { id: 'friends', label: 'Friends' },
  { id: 'school', label: 'School' },
];

export default function LeaderboardPage() {
  const user = useUser();
  const [globalData, setGlobalData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'live' | 'fixture'>('live');

  useEffect(() => {
    getLeaderboardGlobal().then(({ entries, source: s }) => {
      setGlobalData(entries.map((e: any) => ({
        ...e,
        isCurrentUser: !!user?.id && e.userId === user.id,
      })));
      setSource(s);
      setLoading(false);
    });
  }, [user?.id]);

  const currentUser = globalData.find((e) => e.isCurrentUser);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Leaderboard</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          See where you stand among learners
        </p>
      </div>

      {source === 'fixture' && (
        <div className="mb-4 rounded-md border border-dojo-warning/30 bg-dojo-warning/5 px-4 py-2 text-xs text-dojo-warning">
          Showing offline data — some options may be out of date
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-dojo-text-muted animate-pulse">
          Loading leaderboard...
        </div>
      ) : (
        <>
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
                      <Badge variant={currentUser.level as SkillLevel}>{currentUser.level}</Badge>
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

          <Card>
            <Tabs
              tabs={tabs}
              renderPanel={(tabId) => {
                if (tabId === 'friends') {
                  return (
                    <div className="p-6 text-center">
                      <p className="text-sm text-dojo-text-muted">
                        Friends leaderboard coming soon — no social graph exists yet.
                      </p>
                    </div>
                  );
                }
                if (tabId === 'school') {
                  return (
                    <div className="p-6 text-center">
                      <p className="text-sm text-dojo-text-muted">
                        School leaderboard coming soon.
                      </p>
                    </div>
                  );
                }
                return <LeaderboardTable data={globalData} />;
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}

function LeaderboardTable({ data }: { data: LeaderboardEntry[] }) {
  return (
    <div className="divide-y divide-dojo-border">
      {data.map((entry) => (
        <div
          key={entry.userId}
          className={`flex items-center gap-4 px-6 py-4 ${entry.isCurrentUser ? 'bg-dojo-accent/5' : ''}`}
        >
          <div className="flex w-8 items-center justify-center">
            {entry.rank === 1 ? (
              <Trophy className="h-5 w-5 text-yellow-400" />
            ) : entry.rank === 2 ? (
              <Medal className="h-5 w-5 text-gray-400" />
            ) : entry.rank === 3 ? (
              <Medal className="h-5 w-5 text-amber-600" />
            ) : (
              <span className="text-sm font-medium text-dojo-text-muted">{entry.rank}</span>
            )}
          </div>
          <Avatar name={entry.name} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dojo-text-primary truncate">{entry.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={entry.level as SkillLevel}>{entry.level}</Badge>
              <span className="text-xs text-dojo-text-muted">{entry.sessionsCompleted} sessions</span>
            </div>
          </div>
          <div className="text-right shrink-0 flex items-center gap-3">
            {entry.streak > 0 && (
              <div className="flex items-center gap-1">
                <Flame className="h-4 w-4 text-dojo-streak" />
                <span className="text-xs font-medium text-dojo-streak">{entry.streak}</span>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-dojo-text-primary">{entry.xp.toLocaleString()}</p>
              <p className="text-xs text-dojo-text-muted">XP</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
