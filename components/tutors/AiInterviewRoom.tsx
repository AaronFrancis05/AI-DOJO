/* ───────────────────────────────────────────────
   AiInterviewRoom — an assessment whose examiner is the AI.

   The sibling of `AssessmentRoom`, chosen by the page on
   `assessment.examiner`. They share the table, the queue slot and the
   evaluation anchor, and almost nothing else: there is no video call, no line
   to admit from, and no tutor in the room. Composing this out of
   `AssessmentRoom` would have meant a component that is two components with a
   flag, so it is two components.

   The tutor sees results as they land; a learner sees only their own.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AiInterviewStage } from './AiInterviewStage';
import { AiInterviewResults, type InterviewRow } from './AiInterviewResults';
import { Card } from '@/components/ui/Card';
import { SCORE_DIMENSIONS } from '@/lib/ai-engine';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';
import type { InterviewerPersona } from '@/lib/interview/persona';
import { Bot } from 'lucide-react';

interface MyInterview {
  id: number;
  status: string;
  learnerTurns: number;
  scores: Record<string, number> | null;
  feedback: string | null;
  graded: boolean;
}

interface AiInterviewRoomProps {
  assessmentId: number;
  isTutor: boolean;
  interviewer: InterviewerPersona;
  minutesPerLearner: number;
  canJoin: boolean;
  joinBlockedReason: string | null;
}

const DIMENSION_LABELS: Record<string, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  fluency: 'Fluency',
  cultural: 'Cultural fit',
  task: 'Task completion',
  expressionAppropriateness: 'Expression',
};

export function AiInterviewRoom({
  assessmentId,
  isTutor,
  interviewer,
  minutesPerLearner,
  canJoin,
  joinBlockedReason,
}: AiInterviewRoomProps) {
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [me, setMe] = useState<MyInterview | null>(null);
  const [loaded, setLoaded] = useState(false);

  // A promise chain rather than an async callback: the form that satisfies
  // `react-hooks/set-state-in-effect` while staying callable from a realtime
  // handler as well as from an effect. See MEMORY.md, Stage 4.
  const load = useCallback(
    () =>
      fetch(`/api/assessments/${assessmentId}/interview`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          setLoaded(true);
          if (!data?.success) return;
          setInterviews((data.interviews ?? []) as InterviewRow[]);
          setMe((data.me ?? null) as MyInterview | null);
        })
        .catch(() => setLoaded(true)),
    [assessmentId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The tutor's list moves as learners finish. A learner is subscribed too,
  // but only once they have a queue slot — before that there is nothing about
  // them to push.
  useRealtimeTopics([topics.assessment(assessmentId)], {
    onEvent: (event) => {
      if (event.type === 'assessment.queue' || event.type === 'assessment.status') {
        void load();
      }
    },
    onSync: load,
  });

  if (isTutor) {
    const finished = interviews.filter((i) => i.status === 'completed').length;
    return (
      <div className="space-y-4">
        <Card className="!p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
            <Bot className="h-4 w-4 shrink-0 text-dojo-accent" />
            {interviewer.name} is examining for you
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
            Every learner gets their own {minutesPerLearner}-minute interview, so they all sit it at
            once and there is no queue to work. {finished === 0
              ? 'Results appear below as they finish.'
              : `${finished} of ${interviews.length} finished.`}
          </p>
        </Card>

        <AiInterviewResults
          assessmentId={assessmentId}
          interviewerName={interviewer.name}
          interviews={interviews}
        />
      </div>
    );
  }

  // A learner who has already sat it sees the result, not the start button.
  const alreadyTaken = me?.status === 'completed';

  return (
    <div className="space-y-4">
      {loaded && alreadyTaken && me && (
        <Card className="!p-5">
          <h2 className="text-sm font-bold text-dojo-text-primary">
            {me.graded ? `${interviewer.name}'s marks` : 'Your examination was recorded'}
          </h2>
          {me.graded && me.scores ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {SCORE_DIMENSIONS.map((dimension) => (
                  <div key={dimension}>
                    <dt className="text-xs text-dojo-text-muted">{DIMENSION_LABELS[dimension]}</dt>
                    <dd className="text-lg font-bold tabular-nums leading-none text-dojo-text-primary">
                      {me.scores?.[dimension] ?? 0}
                      <span className="text-xs font-normal text-dojo-text-muted"> / 100</span>
                    </dd>
                  </div>
                ))}
              </dl>
              {me.feedback && (
                <p className="mt-4 text-sm leading-relaxed text-dojo-text-primary">{me.feedback}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
              It could not be marked automatically. Your tutor will review the transcript.
            </p>
          )}
        </Card>
      )}

      {loaded && !alreadyTaken && (
        <AiInterviewStage
          assessmentId={assessmentId}
          interviewer={interviewer}
          minutesPerLearner={minutesPerLearner}
          canJoin={canJoin}
          joinBlockedReason={joinBlockedReason}
          alreadyTaken={false}
          onSubmitted={load}
        />
      )}

      {!loaded && (
        <Card className="animate-pulse !p-5">
          <div className="h-40 rounded bg-dojo-surface-raised" />
        </Card>
      )}
    </div>
  );
}
