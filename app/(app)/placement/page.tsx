/* ───────────────────────────────────────────────
   Your level — the CEFR placement interview, the
   monthly re-test, and the syllabus progress map.
   Gated behind NEXT_PUBLIC_HYBRID_ENABLED.
   Consumes /api/placement and /api/syllabus/progress.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AiInterviewStage } from '@/components/tutors/AiInterviewStage';
import { CefrProgressMap } from '@/components/tutors/CefrProgressMap';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUiLocale } from '@/lib/language-context';
import { formatDate } from '@/lib/i18n/format';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { CEFR_LABELS, type CefrVerdict } from '@/lib/interview/cefr';
import type { InterviewerPersona } from '@/lib/interview/persona';
import { Gauge } from 'lucide-react';

interface PlacementState {
  interviewer: InterviewerPersona;
  minutes: number;
  latest: {
    id: number;
    status: string;
    endedAt: string | null;
    cefr: CefrVerdict | null;
    feedback: string | null;
  } | null;
  nextAttemptAt: string | null;
}

const START_BODY = { purpose: 'placement' };

export default function PlacementPage() {
  usePageTitle('Your level');
  const { locale } = useUiLocale();
  const [state, setState] = useState<PlacementState | null>(null);
  const [loading, setLoading] = useState(HYBRID_ENABLED);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      fetch('/api/placement?purpose=placement', { credentials: 'include' })
        .then((r) => r.json())
        .then((body) => {
          if (body.success) setState(body as PlacementState);
          else setError(body.error ?? 'Could not load your level.');
        })
        .catch(() => setError('Could not load your level.'))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    if (HYBRID_ENABLED) void load();
  }, [load]);

  if (!HYBRID_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="py-12 text-center">
          <p className="text-sm text-dojo-text-muted">The placement interview is not available yet.</p>
        </Card>
      </div>
    );
  }

  const graded = state?.latest?.cefr ?? null;
  const canStart = state != null && state.nextAttemptAt == null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-10">
      <h1 className="hidden text-3xl font-bold leading-none tracking-tight text-dojo-text-primary md:block">
        Your level
      </h1>

      {loading && (
        <Card className="animate-pulse !p-5">
          <div className="h-32 rounded bg-dojo-surface-raised" />
        </Card>
      )}

      {error && <p className="text-sm text-dojo-danger">{error}</p>}

      {state && (
        <>
          <Card className="!p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
              <Gauge className="h-4 w-4 shrink-0 text-dojo-accent" />
              {graded ? 'Your current level' : 'Find your level'}
            </h2>
            {graded ? (
              <>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-bold leading-none tracking-tight text-dojo-text-primary">
                    {graded.overall}
                  </span>
                  <span className="text-sm text-dojo-text-muted">{CEFR_LABELS[graded.overall]}</span>
                  {state.latest?.endedAt && (
                    <Badge variant="outline" className="ms-auto">
                      {formatDate(state.latest.endedAt, locale)}
                    </Badge>
                  )}
                </p>
                {state.latest?.feedback && (
                  <p className="mt-4 text-sm leading-relaxed text-dojo-text-primary">{state.latest.feedback}</p>
                )}
                <p className="mt-4 text-sm leading-relaxed text-dojo-text-muted">
                  {state.nextAttemptAt
                    ? `Re-test from ${formatDate(state.nextAttemptAt, locale)} to measure your progress.`
                    : 'A re-test is open now. Take it to see how far you have come.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
                A short spoken interview places you on the CEFR scale, from A1 to C2. Your lessons,
                scenarios and tutor briefings start from that level, and a monthly re-test shows your
                progress.
              </p>
            )}
          </Card>

          {canStart && (
            <AiInterviewStage
              endpoint="/api/placement"
              startBody={START_BODY}
              interviewer={state.interviewer}
              minutesPerLearner={state.minutes}
              canJoin
              joinBlockedReason={null}
              alreadyTaken={false}
              onSubmitted={load}
              resultNote="Your level is saved to your profile. Your tutor sees it in their briefing before your next lesson."
            />
          )}
        </>
      )}

      <CefrProgressMap />
    </div>
  );
}
