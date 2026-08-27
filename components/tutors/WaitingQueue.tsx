/* ───────────────────────────────────────────────
   WaitingQueue — the assessment room's line.

   Two audiences, one component, because the underlying state is identical
   and the two views must never disagree about it:

     tutor    the whole line, with an "Admit" on each waiting learner
     learner  their own position and an estimate, and nothing about anyone else

   The split is enforced server-side — /api/assessments/[id]/queue returns an
   empty `queue` to a learner — so this component renders what it is given
   rather than deciding what to hide.
   ─────────────────────────────────────────────── */

'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/design-tokens';
import { Users, Clock, LogOut } from 'lucide-react';

export interface QueueRow {
  id: number;
  learnerId: string;
  name: string;
  avatarSrc: string | null;
  position: number;
  state: string;
}

export interface QueueMe {
  position: number;
  state: string;
  waitingAhead: number | null;
  estimatedWaitMinutes: number | null;
}

interface WaitingQueueProps {
  isTutor: boolean;
  queue: QueueRow[];
  waitingCount: number;
  me: QueueMe | null;
  busy?: boolean;
  onAdmit?: (learnerId: string) => void;
  onAdmitNext?: () => void;
  onFinish?: () => void;
  onJoinQueue?: () => void;
  onLeaveQueue?: () => void;
  className?: string;
}

const STATE_LABEL: Record<string, string> = {
  waiting: 'Waiting',
  admitted: 'In the room',
  done: 'Finished',
};

export function WaitingQueue({
  isTutor,
  queue,
  waitingCount,
  me,
  busy = false,
  onAdmit,
  onAdmitNext,
  onFinish,
  onJoinQueue,
  onLeaveQueue,
  className,
}: WaitingQueueProps) {
  const admitted = queue.find((q) => q.state === 'admitted') ?? null;

  return (
    <aside
      className={cn(
        'flex min-h-0 w-full flex-col rounded-(--radius-md) border border-dojo-border bg-dojo-surface',
        className,
      )}
    >
      <header className="shrink-0 border-b border-dojo-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
          <Users className="h-3.5 w-3.5" />
          Queue
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
          {waitingCount === 0
            ? 'Nobody is waiting.'
            : `${waitingCount} ${waitingCount === 1 ? 'person' : 'people'} waiting.`}
        </p>
      </header>

      {isTutor ? (
        <>
          <div className="flex-1 overflow-y-auto">
            {queue.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-dojo-text-muted">
                Learners appear here as they join.
              </p>
            ) : (
              queue.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    'flex items-center gap-3 border-b border-dojo-border px-4 py-3 last:border-b-0',
                    row.state === 'admitted' && 'bg-dojo-accent-soft/40',
                    row.state === 'done' && 'opacity-60',
                  )}
                >
                  <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-dojo-text-muted">
                    {row.position}
                  </span>
                  <Avatar name={row.name} src={row.avatarSrc ?? undefined} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-dojo-text-primary">{row.name}</p>
                    <p className="text-[11px] text-dojo-text-muted">
                      {STATE_LABEL[row.state] ?? row.state}
                    </p>
                  </div>
                  {row.state === 'waiting' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onAdmit?.(row.learnerId)}
                    >
                      Admit
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 space-y-2 border-t border-dojo-border p-3">
            <Button
              variant="primary"
              className="w-full"
              loading={busy}
              disabled={busy || waitingCount === 0}
              onClick={onAdmitNext}
            >
              {admitted ? 'Finish and admit next' : 'Admit next'}
            </Button>
            {admitted && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={onFinish}
              >
                End this turn
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-between p-4">
          {me ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={me.state === 'admitted' ? 'accent' : 'outline'}>
                  {STATE_LABEL[me.state] ?? me.state}
                </Badge>
              </div>
              {me.state === 'waiting' && (
                <>
                  <p className="text-sm leading-relaxed text-dojo-text-primary">
                    {me.waitingAhead === 0
                      ? 'You are next.'
                      : `${me.waitingAhead} ahead of you.`}
                  </p>
                  {me.estimatedWaitMinutes != null && me.estimatedWaitMinutes > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-dojo-text-muted">
                      <Clock className="h-3 w-3 shrink-0" />
                      Roughly {me.estimatedWaitMinutes} min — an estimate, not a booking.
                    </p>
                  )}
                </>
              )}
              {me.state === 'admitted' && (
                <p className="text-sm leading-relaxed text-dojo-text-primary">
                  You are up. Join the room when you are ready.
                </p>
              )}
              {me.state === 'done' && (
                <p className="text-sm leading-relaxed text-dojo-text-muted">
                  Your turn is finished. Your grade arrives in your notifications.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-dojo-text-muted">
              Take a place in line and you&apos;ll be admitted one at a time.
            </p>
          )}

          <div className="mt-4">
            {me == null ? (
              <Button variant="primary" className="w-full" loading={busy} onClick={onJoinQueue}>
                Join the queue
              </Button>
            ) : me.state === 'waiting' ? (
              <Button variant="secondary" className="w-full" disabled={busy} onClick={onLeaveQueue}>
                <LogOut className="h-4 w-4" /> Leave the queue
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
