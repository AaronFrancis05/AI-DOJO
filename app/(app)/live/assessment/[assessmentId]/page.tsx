/* ───────────────────────────────────────────────
   Assessment room — one learner in the room at a time, the rest queued.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AssessmentRoom } from '@/components/tutors/AssessmentRoom';
import { AiInterviewRoom } from '@/components/tutors/AiInterviewRoom';
import { ExaminerSwitch } from '@/components/tutors/ExaminerSwitch';
import type { InterviewerPersona } from '@/lib/interview/persona';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { getTargetLangConfig } from '@/lib/language';
import { ArrowLeft } from 'lucide-react';

interface AssessmentDetail {
  id: number;
  title: string;
  description: string | null;
  tutorName: string;
  targetLanguage: string;
  scheduledAt: string;
  durationMinutes: number;
  minutesPerLearner: number;
  status: string;
  /** 'tutor' | 'ai' — decides which room is rendered below. */
  examiner: string;
  /** Present only in AI mode; resolved server-side so the room and the locked prompt agree. */
  interviewer: InterviewerPersona | null;
  isTutor: boolean;
  myQueueState: string | null;
  canJoin: boolean;
  joinBlockedReason: string | null;
  /** Tutor-only: null for a learner, who must not read the examiner's brief. */
  aiInterviewerAvatarId: string | null;
  aiInterviewerBrief: string | null;
}

export default function LiveAssessmentPage() {
  const params = useParams<{ assessmentId: string }>();
  const router = useRouter();
  const assessmentId = Number(params.assessmentId);
  usePageTitle('Assessment');

  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(TUTORS_ENABLED && Number.isInteger(assessmentId));
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      !TUTORS_ENABLED || !Number.isInteger(assessmentId)
        ? Promise.resolve()
        : fetch(`/api/assessments/${assessmentId}`, { credentials: 'include' })
            .then((res) => res.json())
            .then((data) => {
              setLoading(false);
              if (data.success) setDetail(data.assessment as AssessmentDetail);
              else setError(data.error ?? 'Assessment not found.');
            })
            .catch(() => {
              setLoading(false);
              setError('Could not load this assessment.');
            }),
    [assessmentId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Only the room's own status is watched here — the queue has its own
  // subscription inside AssessmentRoom, which is where it is rendered.
  useRealtimeTopics(
    Number.isInteger(assessmentId) ? [topics.assessment(assessmentId)] : null,
    {
      onEvent: (event) => {
        if (event.type === 'assessment.status') void load();
      },
    },
  );

  if (!TUTORS_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="py-12 text-center">
          <p className="text-sm text-dojo-text-muted">Live tutoring is not available yet.</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <Card className="animate-pulse">
          <div className="h-80 rounded bg-dojo-surface-raised" />
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="py-12 text-center">
          <p className="text-sm text-dojo-text-muted">{error || 'Assessment not found.'}</p>
          <Button variant="secondary" className="mt-6" onClick={() => router.push('/tutors')}>
            Back to tutors
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <button
        type="button"
        onClick={() => router.push('/tutors')}
        className="mb-6 inline-flex items-center gap-1 text-sm text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to tutors
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-none tracking-tight text-dojo-text-primary">
            {detail.title}
          </h1>
          <p className="mt-2 text-sm text-dojo-text-muted">
            {detail.examiner === 'ai'
              ? detail.isTutor
                ? `${detail.interviewer?.name ?? 'The AI examiner'} is examining for you`
                : `Examined by ${detail.interviewer?.name ?? 'an AI examiner'}, set by ${detail.tutorName}`
              : detail.isTutor
                ? 'You are examining'
                : `Examined by ${detail.tutorName}`}{' '}
            · {new Date(detail.scheduledAt).toLocaleString()} · about{' '}
            {detail.minutesPerLearner} min each
          </p>
          {detail.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dojo-text-muted">
              {detail.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">{getTargetLangConfig(detail.targetLanguage).name}</Badge>
          <Badge variant={detail.status === 'live' ? 'accent' : 'outline'} className="capitalize">
            {detail.status}
          </Badge>
        </div>
      </div>

      {detail.isTutor && (
        <ExaminerSwitch
          className="mb-4"
          assessmentId={detail.id}
          examiner={detail.examiner}
          aiInterviewerAvatarId={detail.aiInterviewerAvatarId}
          aiInterviewerBrief={detail.aiInterviewerBrief}
          onChanged={load}
        />
      )}

      {detail.examiner === 'ai' && detail.interviewer ? (
        <AiInterviewRoom
          assessmentId={detail.id}
          isTutor={detail.isTutor}
          interviewer={detail.interviewer}
          minutesPerLearner={detail.minutesPerLearner}
          canJoin={detail.canJoin}
          joinBlockedReason={detail.joinBlockedReason}
        />
      ) : (
        <AssessmentRoom
          assessmentId={detail.id}
          isTutor={detail.isTutor}
          canJoin={detail.canJoin}
          joinBlockedReason={detail.joinBlockedReason}
        />
      )}
    </div>
  );
}
