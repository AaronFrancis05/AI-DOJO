/* ───────────────────────────────────────────────
   Live Session — the video room for one booking,
   plus the tutor's evaluation form.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CallStage } from '@/components/tutors/CallStage';
import { RoomChatPanel } from '@/components/tutors/RoomChatPanel';
import { EvaluationForm, type EvaluationFormInitial } from '@/components/tutors/EvaluationForm';
import { BriefingPanel, type BriefingJson } from '@/components/tutors/BriefingPanel';
import { LessonPanel } from '@/components/tutors/LessonPanel';
import { LessonPlanEditor } from '@/components/tutors/LessonPlanEditor';
import { LessonNotesForm, type CanDoUnit } from '@/components/tutors/LessonNotesForm';
import { LessonReviewForm } from '@/components/tutors/LessonReviewForm';
import { LiveCaptions } from '@/components/tutors/LiveCaptions';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { ArrowLeft, MessageSquare } from 'lucide-react';

interface Booking {
  id: number;
  tutorName: string;
  sessionId: number | null;
  targetLanguage: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  purpose: string;
  learnerNote: string | null;
  chatRoomId: number | null;
  learnerId: string;
  isTutor: boolean;
  /** The hybrid lesson tools are on for this learner (PLAN.md Phase 4). */
  hybrid: boolean;
}

export default function LiveSessionPage() {
  const params = useParams<{ bookingId: string }>();
  const router = useRouter();
  const bookingId = Number(params.bookingId);
  usePageTitle('Live session');

  const [booking, setBooking] = useState<Booking | null>(null);
  const [aiEval, setAiEval] = useState<Record<string, number> | null>(null);
  // Starts false when there is nothing to fetch — feature off, or a malformed
  // id in the URL — so those paths never call setState from inside an effect
  // just to stop a spinner. Both fall through to the "not found" state below.
  const [loading, setLoading] = useState(TUTORS_ENABLED && Number.isInteger(bookingId));
  const [error, setError] = useState('');

  // Loaded before the form mounts, so a tutor revising an earlier verdict
  // sees it rather than a fresh set of sliders. `null` means "still loading";
  // the form is only rendered once it resolves.
  const [initialEval, setInitialEval] = useState<EvaluationFormInitial | null>(null);

  // Hybrid tools: the tutor's latest captioned line feeds "Explain in my
  // language", and the briefing's syllabus unit feeds can-do marking.
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [canDoUnit, setCanDoUnit] = useState<CanDoUnit | null>(null);
  const onBriefing = (b: BriefingJson) => {
    if (b.syllabus) setCanDoUnit(b.syllabus.unit);
  };

  useEffect(() => {
    if (!TUTORS_ENABLED || !Number.isInteger(bookingId)) return;
    fetch(`/api/bookings/${bookingId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (body.booking) setBooking(body.booking);
        else setError(body.error ?? 'Booking not found.');
      })
      .catch(() => setError('Could not load this booking.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  // The AI's own scores for the reviewed session, so the tutor grades with the
  // machine's verdict visible rather than blind to it.
  useEffect(() => {
    // Gated on isTutor alone: an evaluation booking need not carry a sessionId,
    // and a tutor evaluation saved earlier must still load back into the form.
    if (!booking?.isTutor) return;
    fetch(`/api/bookings/${bookingId}/evaluation`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (body.aiEvaluation) setAiEval(body.aiEvaluation);
        const t = body.tutorEvaluation;
        setInitialEval(
          t
            ? {
                scores: {
                  vocabulary: t.vocabularyScore ?? 70,
                  grammar: t.grammarScore ?? 70,
                  fluency: t.fluencyScore ?? 70,
                  cultural: t.culturalScore ?? 70,
                  task: t.taskScore ?? 70,
                  expressionAppropriateness: t.expressionAppropriatenessScore ?? 70,
                },
                agreesWithAi: t.agreesWithAi ?? null,
                notes: t.notes ?? '',
                saved: true,
              }
            : {},
        );
      })
      .catch(() => setInitialEval({}));
  }, [booking, bookingId]);

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

  if (!booking) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="py-12 text-center">
          <p className="text-sm text-dojo-text-muted">{error || 'Booking not found.'}</p>
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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-dojo-text-primary">
            {booking.isTutor ? 'Teaching session' : `Session with ${booking.tutorName}`}
          </h1>
          <p className="mt-1 text-sm text-dojo-text-muted">
            {new Date(booking.scheduledAt).toLocaleString()} · {booking.durationMinutes} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={booking.status === 'confirmed' ? 'accent' : 'outline'} className="capitalize">
            {booking.status}
          </Badge>
          {booking.chatRoomId && (
            <Link
              href={`/messages/${booking.chatRoomId}`}
              className="inline-flex items-center gap-2 rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-3 py-2 text-sm text-dojo-text-primary transition-colors hover:bg-dojo-surface-raised"
            >
              <MessageSquare className="h-4 w-4" /> Chat
            </Link>
          )}
        </div>
      </div>

      {booking.hybrid && booking.isTutor && (
        <div className="mb-6 space-y-4">
          <BriefingPanel learnerId={booking.learnerId} bookingId={booking.id} onLoaded={onBriefing} />
          <LessonPlanEditor bookingId={booking.id} />
        </div>
      )}

      {booking.learnerNote && (
        <Card className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            From the learner
          </p>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-primary">{booking.learnerNote}</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <CallStage
            tokenEndpoint="/api/live/token"
            tokenBody={{ bookingId: booking.id }}
            layout="speaker"
            joinLabel="Join session"
            tools={booking.hybrid && !booking.isTutor
              ? () => <LiveCaptions bookingId={booking.id} onLine={(line) => setLastCaption(line.original)} />
              : undefined}
          />
          {booking.hybrid && (
            <div className="mt-4">
              <LessonPanel bookingId={booking.id} isTutor={booking.isTutor} lastCaption={lastCaption} />
            </div>
          )}
        </div>
        {/* The same translated chat the /messages page shows for this booking,
            beside the call instead of a tab away from it. */}
        <RoomChatPanel
          key={booking.chatRoomId ?? 'none'}
          roomId={booking.chatRoomId}
          className="h-[28rem] lg:h-auto lg:max-h-[calc(100dvh-14rem)]"
        />
      </div>

      {booking.hybrid && booking.isTutor && booking.purpose === 'lesson' && (
        <div className="mt-8">
          <LessonNotesForm bookingId={booking.id} unit={canDoUnit} />
        </div>
      )}

      {booking.hybrid && !booking.isTutor && (
        <div className="mt-8">
          <LessonReviewForm bookingId={booking.id} tutorName={booking.tutorName} />
        </div>
      )}

      {/* Only the tutor grades, and only for an evaluation booking. */}
      {booking.isTutor && booking.purpose === 'evaluation' && initialEval && (
        <Card className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Your evaluation
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
            Same 0-100 scale the AI uses, so the two verdicts sit side by side.
          </p>

          <EvaluationForm
            className="mt-6"
            endpoint={`/api/bookings/${bookingId}/evaluation`}
            aiScores={aiEval}
            initial={initialEval}
          />
        </Card>
      )}
    </div>
  );
}
