/* ───────────────────────────────────────────────
   AiInterviewResults — what the tutor comes back to.

   The tutor was not in the room; this is the room, after the fact. Each
   learner's interview expands to its transcript and the AI examiner's scores,
   with the same `EvaluationForm` the tutor-run assessment room uses beneath
   it, pre-seeded with those scores as `aiScores`.

   That last part is the point of the whole feature rather than a nicety.
   `tutor_evaluations.agreesWithAi` was built to answer "did the AI's
   assessment hold up against a human's", and until now the AI side of that
   comparison was a roleplay session the tutor never saw. Here the tutor marks
   the very same examination the machine marked, which is the first time the
   two verdicts have been about one identical thing.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EvaluationForm } from './EvaluationForm';
import { SCORE_DIMENSIONS } from '@/lib/ai-engine';
import type { InterviewTurn } from '@/lib/interview/transcript';
import { cn } from '@/lib/design-tokens';
import { ChevronDown, Loader2 } from 'lucide-react';

export interface InterviewRow {
  id: number;
  learnerId: string;
  learnerName: string;
  avatarSrc: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  learnerTurns: number;
  scores: Record<string, number> | null;
  feedback: string | null;
}

interface AiInterviewResultsProps {
  assessmentId: number;
  interviewerName: string;
  interviews: InterviewRow[];
  className?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Not started',
  live: 'In progress',
  completed: 'Finished',
  failed: 'Interrupted',
};

export function AiInterviewResults({
  assessmentId,
  interviewerName,
  interviews,
  className,
}: AiInterviewResultsProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [transcripts, setTranscripts] = useState<Record<number, InterviewTurn[]>>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // Fetched when a row is opened, not with the list: a roomful of transcripts
  // is megabytes of text the tutor has not asked to read.
  const open = useCallback(
    (id: number) => {
      if (openId === id) {
        setOpenId(null);
        return;
      }
      setOpenId(id);
      if (transcripts[id]) return;

      setLoadingId(id);
      fetch(`/api/assessments/${assessmentId}/interview?interviewId=${id}`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          setLoadingId(null);
          if (data?.success) {
            setTranscripts((prev) => ({ ...prev, [id]: data.interview.transcript ?? [] }));
          }
        })
        .catch(() => setLoadingId(null));
    },
    [assessmentId, openId, transcripts],
  );

  if (interviews.length === 0) {
    return (
      <p
        className={cn(
          'rounded-(--radius-md) border border-dashed border-dojo-border px-4 py-8 text-center text-sm text-dojo-text-muted',
          className,
        )}
      >
        No one has sat this examination yet. Results appear here as learners finish.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {interviews.map((row) => {
        const isOpen = openId === row.id;
        const transcript = transcripts[row.id];

        return (
          <Card key={row.id} className="!p-0">
            <button
              type="button"
              onClick={() => open(row.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-dojo-surface-raised"
            >
              <Avatar name={row.learnerName} src={row.avatarSrc ?? undefined} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-dojo-text-primary">
                  {row.learnerName}
                </p>
                <p className="text-[11px] text-dojo-text-muted">
                  {STATUS_LABEL[row.status] ?? row.status}
                  {row.endedAt && ` · ${new Date(row.endedAt).toLocaleString()}`}
                  {` · ${row.learnerTurns} ${row.learnerTurns === 1 ? 'answer' : 'answers'}`}
                </p>
              </div>
              {row.scores ? (
                <Badge variant="accent">Marked</Badge>
              ) : (
                <Badge variant="outline">
                  {row.status === 'completed' ? 'Unmarked' : STATUS_LABEL[row.status] ?? row.status}
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-dojo-text-muted transition-transform',
                  isOpen && 'rotate-180',
                )}
              />
            </button>

            {isOpen && (
              <div className="space-y-6 border-t border-dojo-border px-4 py-4">
                {row.scores && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
                      {interviewerName}&apos;s marks
                    </h4>
                    <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {SCORE_DIMENSIONS.map((dimension) => (
                        <div key={dimension}>
                          <dt className="text-xs capitalize text-dojo-text-muted">{dimension}</dt>
                          <dd className="text-base font-bold tabular-nums leading-none text-dojo-text-primary">
                            {row.scores?.[dimension] ?? 0}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {row.feedback && (
                      <p className="mt-3 text-sm leading-relaxed text-dojo-text-muted">
                        {row.feedback}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
                    Transcript
                  </h4>
                  {loadingId === row.id ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-dojo-text-muted">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> Loading…
                    </p>
                  ) : transcript && transcript.length > 0 ? (
                    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded-(--radius-md) border border-dojo-border p-4">
                      {transcript.map((turn, index) => (
                        <p
                          key={`${turn.at}-${index}`}
                          className={cn(
                            'text-sm leading-relaxed',
                            turn.speaker === 'examiner'
                              ? 'text-dojo-text-muted'
                              : 'text-dojo-text-primary',
                          )}
                        >
                          <span className="font-semibold">
                            {turn.speaker === 'examiner' ? interviewerName : row.learnerName}:{' '}
                          </span>
                          {turn.text}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-dojo-text-muted">
                      Nothing was recorded for this attempt.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-dojo-text-muted">
                    Transcribed in the learner&apos;s browser during the examination — read it as a
                    record of what was said, not as an audited one.
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
                    Your own verdict
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
                    Same six dimensions, so yours and {interviewerName}&apos;s sit side by side on
                    the learner&apos;s grades.
                  </p>
                  <EvaluationForm
                    className="mt-4"
                    endpoint={`/api/assessments/${assessmentId}/evaluate`}
                    extraBody={{ learnerId: row.learnerId }}
                    aiScores={row.scores}
                  />
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
