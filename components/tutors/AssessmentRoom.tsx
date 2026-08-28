/* ───────────────────────────────────────────────
   AssessmentRoom — the same call, run as an examination.

   Exactly one learner is in the room at a time. That rule is enforced by the
   server (the token route refuses anyone whose queue slot is not `admitted`)
   and by the queue transaction; this component's job is to make the state
   legible and to keep it current without polling.

   The tutor also grades from here, on the same six 0-100 dimensions the AI
   uses, so the two verdicts stay comparable — see tutor_evaluations.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { CallStage } from './CallStage';
import { WaitingQueue, type QueueMe, type QueueRow } from './WaitingQueue';
import { EvaluationForm } from './EvaluationForm';
import { Card } from '@/components/ui/Card';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';

interface AssessmentRoomProps {
  assessmentId: number;
  isTutor: boolean;
  canJoin: boolean;
  joinBlockedReason: string | null;
}

interface QueueState {
  queue: QueueRow[];
  waitingCount: number;
  admittedLearnerId: string | null;
  me: QueueMe | null;
}

const EMPTY: QueueState = { queue: [], waitingCount: 0, admittedLearnerId: null, me: null };

export function AssessmentRoom({
  assessmentId,
  isTutor,
  canJoin,
  joinBlockedReason,
}: AssessmentRoomProps) {
  const [state, setState] = useState<QueueState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadQueue = useCallback(
    () =>
      fetch(`/api/assessments/${assessmentId}/queue`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.success) return;
          setState({
            queue: (data.queue ?? []) as QueueRow[],
            waitingCount: Number(data.waitingCount) || 0,
            admittedLearnerId: data.admittedLearnerId ?? null,
            me: data.me ?? null,
          });
        })
        .catch(() => {
          // transient — the next event or reconciliation retries
        }),
    [assessmentId],
  );

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // The queue is the one piece of state both sides must agree on second by
  // second: a learner watching the line move, and a tutor pressing "admit".
  useRealtimeTopics([topics.assessment(assessmentId)], {
    onEvent: (event) => {
      if (event.type === 'assessment.queue' || event.type === 'assessment.status') {
        void loadQueue();
      }
    },
    onSync: loadQueue,
  });

  const mutate = useCallback(
    async (init: RequestInit) => {
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/queue`, {
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          ...init,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'That did not work.');
        // The publish reaches every OTHER tab; this one refreshes directly
        // rather than waiting to hear about its own action.
        await loadQueue();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not work.');
      } finally {
        setBusy(false);
      }
    },
    [assessmentId, loadQueue],
  );

  const admittedLearner =
    state.queue.find((q) => q.learnerId === state.admittedLearnerId) ?? null;

  // A learner may join the call only on their own turn. Both halves matter:
  // the room's own window, and the queue.
  const myTurn = isTutor || state.me?.state === 'admitted';
  const blockedReason = !canJoin
    ? joinBlockedReason
    : state.me == null
      ? 'Join the queue to be admitted.'
      : state.me.state === 'done'
        ? 'Your assessment is finished.'
        : 'Waiting for the tutor to admit you.';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <CallStage
          tokenEndpoint={`/api/live/assessment/${assessmentId}/token`}
          layout="speaker"
          joinLabel={isTutor ? 'Open the room' : 'Enter the room'}
          idleMessage={
            isTutor
              ? 'Open the room, then admit learners one at a time.'
              : 'You are up. Enter when you are ready.'
          }
          blocked={!canJoin || !myTurn}
          blockedReason={blockedReason ?? undefined}
        />

        {isTutor && admittedLearner && (
          <Card className="!p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
              Grade {admittedLearner.name}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
              Same 0-100 scale the AI uses, so the two verdicts sit side by side.
            </p>
            <EvaluationForm
              className="mt-6"
              endpoint={`/api/assessments/${assessmentId}/evaluate`}
              extraBody={{ learnerId: admittedLearner.learnerId }}
              // Keyed on the learner so admitting the next one resets the
              // sliders rather than carrying the last verdict over.
              key={admittedLearner.learnerId}
            />
          </Card>
        )}

        {error && <p className="text-sm text-dojo-danger">{error}</p>}
      </div>

      <WaitingQueue
        isTutor={isTutor}
        queue={state.queue}
        waitingCount={state.waitingCount}
        me={state.me}
        busy={busy}
        onAdmit={(learnerId) =>
          mutate({ method: 'PATCH', body: JSON.stringify({ action: 'admit', learnerId }) })
        }
        onAdmitNext={() => mutate({ method: 'PATCH', body: JSON.stringify({ action: 'admit' }) })}
        onFinish={() => mutate({ method: 'PATCH', body: JSON.stringify({ action: 'finish' }) })}
        onJoinQueue={() => mutate({ method: 'POST', body: JSON.stringify({}) })}
        onLeaveQueue={() => mutate({ method: 'DELETE' })}
        className="h-[28rem] lg:h-auto lg:max-h-[calc(100dvh-10rem)]"
      />
    </div>
  );
}
