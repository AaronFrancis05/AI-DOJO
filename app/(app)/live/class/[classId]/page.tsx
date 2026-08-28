/* ───────────────────────────────────────────────
   Live class — one tutor, many learners, plus the translated chat sidebar.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ClassRoom, type RosterEntry } from '@/components/tutors/ClassRoom';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { getTargetLangConfig } from '@/lib/language';
import { ArrowLeft } from 'lucide-react';

interface ClassDetail {
  id: number;
  title: string;
  description: string | null;
  tutorName: string;
  unitId: number | null;
  targetLanguage: string;
  scheduledAt: string;
  durationMinutes: number;
  capacity: number;
  status: string;
  chatRoomId: number | null;
  isTutor: boolean;
  myEnrollmentStatus: string | null;
  canJoin: boolean;
  joinBlockedReason: string | null;
}

export default function LiveClassPage() {
  const params = useParams<{ classId: string }>();
  const router = useRouter();
  const classId = Number(params.classId);
  usePageTitle('Live class');

  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  // Starts false when there is nothing to fetch — feature off, or a malformed
  // id — so those paths never call setState from inside an effect just to
  // stop a spinner.
  const [loading, setLoading] = useState(TUTORS_ENABLED && Number.isInteger(classId));
  const [error, setError] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(
    () =>
      !TUTORS_ENABLED || !Number.isInteger(classId)
        ? Promise.resolve()
        : fetch(`/api/classes/${classId}`, { credentials: 'include' })
            .then((res) => res.json())
            .then((data) => {
              setLoading(false);
              if (data.success) {
                setDetail(data.classSession as ClassDetail);
                setRoster((data.roster ?? []) as RosterEntry[]);
              } else {
                setError(data.error ?? 'Class not found.');
              }
            })
            .catch(() => {
              setLoading(false);
              setError('Could not load this class.');
            }),
    [classId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The roster moves as people enrol and arrive; nobody should have to
  // refresh a live page to see who is in the room.
  useRealtimeTopics(
    Number.isInteger(classId) ? [topics.classSession(classId)] : null,
    { onEvent: () => { void load(); }, onSync: load },
  );

  const enroll = useCallback(async () => {
    setEnrolling(true);
    setError('');
    try {
      const res = await fetch(`/api/classes/${classId}/enroll`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not enrol.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enrol.');
    } finally {
      setEnrolling(false);
    }
  }, [classId, load]);

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
          <p className="text-sm text-dojo-text-muted">{error || 'Class not found.'}</p>
          <Button variant="secondary" className="mt-6" onClick={() => router.push('/tutors')}>
            Back to tutors
          </Button>
        </Card>
      </div>
    );
  }

  const enrolled = detail.myEnrollmentStatus != null && detail.myEnrollmentStatus !== 'cancelled';

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
            {detail.isTutor ? 'You are teaching' : `With ${detail.tutorName}`} ·{' '}
            {new Date(detail.scheduledAt).toLocaleString()} · {detail.durationMinutes} min
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

      {!detail.isTutor && !enrolled ? (
        <Card className="py-12 text-center">
          <p className="text-sm leading-relaxed text-dojo-text-muted">
            You are not enrolled in this class yet.
          </p>
          {error && <p className="mt-3 text-sm text-dojo-danger">{error}</p>}
          <Button variant="primary" className="mt-6" loading={enrolling} onClick={enroll}>
            Enrol
          </Button>
        </Card>
      ) : (
        <ClassRoom
          classId={detail.id}
          chatRoomId={detail.chatRoomId}
          roster={roster}
          canJoin={detail.canJoin}
          joinBlockedReason={detail.joinBlockedReason}
        />
      )}
    </div>
  );
}
