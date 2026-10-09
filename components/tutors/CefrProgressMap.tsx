/* ───────────────────────────────────────────────
   CefrProgressMap — the learner's place in the syllabus
   (PLAN.md 4.7): units completed per CEFR level, and
   the standing of each can-do statement. Statements are
   marked by tutors after a lesson; "confirmed" means an
   AI session or the re-test backed up an "achieved".
   Consumes /api/syllabus/progress. Renders nothing when
   the learner's language has no syllabus.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn } from '@/lib/design-tokens';
import type { SyllabusMap } from '@/lib/courses/syllabus-data';
import type { CanDoStatus } from '@/lib/courses/syllabus';
import { Check, Circle, CircleDot, Map as MapIcon } from 'lucide-react';

const STATUS_LABELS: Record<CanDoStatus, string> = {
  introduced: 'Introduced',
  practised: 'Practised',
  achieved: 'Achieved',
};

function StatusIcon({ status }: { status: CanDoStatus | null }) {
  if (status === 'achieved') return <Check className="h-4 w-4 shrink-0 text-dojo-success" />;
  if (status) return <CircleDot className="h-4 w-4 shrink-0 text-dojo-accent" />;
  return <Circle className="h-4 w-4 shrink-0 text-dojo-text-muted" />;
}

export function CefrProgressMap() {
  const [map, setMap] = useState<SyllabusMap | null>(null);
  const [cefrLevel, setCefrLevel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/syllabus/progress', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.success) return;
        setMap(body.syllabus ?? null);
        setCefrLevel(body.cefrLevel ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!map) return null;

  return (
    <Card className="!p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
        <MapIcon className="h-4 w-4 shrink-0 text-dojo-accent" />
        Your progress map
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
        {map.courseTitle}. Your tutor marks each can-do statement as you work through it.
      </p>

      <div className="mt-6 space-y-6">
        {map.levels.map((level) => {
          const done = level.units.filter((u) => u.achieved).length;
          const current = level.cefrLevel === cefrLevel;
          return (
            <section key={level.id}>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold leading-none text-dojo-text-primary">{level.cefrLevel}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-dojo-text-muted">{level.title}</span>
                {current && <Badge variant="accent">Your level</Badge>}
                <span className="text-xs tabular-nums text-dojo-text-muted">
                  {done}/{level.units.length} units
                </span>
              </div>
              <ProgressBar
                className="mt-2"
                value={level.units.length === 0 ? 0 : (done / level.units.length) * 100}
              />
              <ul className="mt-4 space-y-4">
                {level.units.map((unit) => (
                  <li key={unit.id}>
                    <p className={cn('text-sm font-semibold', unit.achieved ? 'text-dojo-success' : 'text-dojo-text-primary')}>
                      {unit.title}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {unit.canDo.map((c) => (
                        <li key={c.index} className="flex items-start gap-2 text-sm leading-relaxed text-dojo-text-muted">
                          <StatusIcon status={c.status} />
                          <span className="min-w-0 flex-1">{c.text}</span>
                          {c.status && (
                            <span className="shrink-0 text-xs">
                              {STATUS_LABELS[c.status]}{c.confirmed ? ' · confirmed' : ''}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
