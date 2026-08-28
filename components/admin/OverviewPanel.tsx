'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Loading, adminFetch } from '@/components/admin/shared';

interface Stats {
  learners: number;
  tutors: number;
  admins: number;
  suspended: number;
  pendingTutors: number;
  activeCourses: number;
  activeDomains: number;
  enabledTargetLanguages: number;
  upcomingClasses: number;
  upcomingAssessments: number;
}

/** Figures that want acting on are called out; the rest are plain counts. */
const TILES: { key: keyof Stats; label: string; hint?: string; alert?: boolean }[] = [
  { key: 'learners', label: 'Learners' },
  { key: 'tutors', label: 'Tutors' },
  { key: 'admins', label: 'Admins' },
  { key: 'pendingTutors', label: 'Awaiting verification', hint: 'On the Tutors tab', alert: true },
  { key: 'suspended', label: 'Suspended or closed', hint: 'On the Users tab' },
  { key: 'enabledTargetLanguages', label: 'Languages offered', hint: 'On the Languages tab' },
  { key: 'activeCourses', label: 'Published courses' },
  { key: 'activeDomains', label: 'Active domains' },
  { key: 'upcomingClasses', label: 'Classes this week' },
  { key: 'upcomingAssessments', label: 'Assessments this week' },
];

export function OverviewPanel({ onError }: { onError: (msg: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ stats: Stats }>('/api/admin/stats')
      .then((data) => { if (!cancelled) setStats(data.stats); })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load stats'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onError]);

  if (loading) return <Loading />;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {TILES.map((tile) => {
        const value = stats[tile.key];
        const highlight = Boolean(tile.alert) && value > 0;
        return (
          <Card key={tile.key} raised className="!p-4">
            <p
              className={
                highlight
                  ? 'text-3xl font-bold leading-none tracking-tight text-dojo-warning-strong'
                  : 'text-3xl font-bold leading-none tracking-tight text-dojo-text-primary'
              }
            >
              {value}
            </p>
            <p className="mt-2 text-sm font-medium text-dojo-text-primary">{tile.label}</p>
            {tile.hint && <p className="mt-0.5 text-xs text-dojo-text-muted">{tile.hint}</p>}
          </Card>
        );
      })}
    </div>
  );
}
