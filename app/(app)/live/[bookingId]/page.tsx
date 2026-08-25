/* ───────────────────────────────────────────────
   Live Session — the video room for one booking,
   plus the tutor's evaluation form.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LiveRoom } from '@/components/tutors/LiveRoom';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { SCORE_DIMENSIONS } from '@/lib/ai-engine';
import { cn } from '@/lib/design-tokens';
import { ArrowLeft, MessageSquare, Check } from 'lucide-react';

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
  isTutor: boolean;
}

const DIMENSION_LABELS: Record<string, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  fluency: 'Fluency',
  cultural: 'Cultural fit',
  task: 'Task completion',
  expressionAppropriateness: 'Expression',
};

const AGREEMENT_OPTIONS = [
  { value: 'agrees', label: 'About right' },
  { value: 'too_generous', label: 'AI was too generous' },
  { value: 'too_harsh', label: 'AI was too harsh' },
];

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

  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, 70])),
  );
  const [agreement, setAgreement] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        if (body.tutorEvaluation) {
          const t = body.tutorEvaluation;
          setScores({
            vocabulary: t.vocabularyScore ?? 70,
            grammar: t.grammarScore ?? 70,
            fluency: t.fluencyScore ?? 70,
            cultural: t.culturalScore ?? 70,
            task: t.taskScore ?? 70,
            expressionAppropriateness: t.expressionAppropriatenessScore ?? 70,
          });
          setAgreement(t.agreesWithAi ?? null);
          setNotes(t.notes ?? '');
          setSaved(true);
        }
      })
      .catch(() => {});
  }, [booking, bookingId]);

  const submitEvaluation = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/evaluation`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scores, agreesWithAi: agreement, notes }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Could not save.');
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the evaluation.');
    } finally {
      setSaving(false);
    }
  }, [bookingId, scores, agreement, notes]);

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
      <div className="mx-auto w-full max-w-4xl p-6">
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
    <div className="mx-auto w-full max-w-4xl p-6">
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

      {booking.learnerNote && (
        <Card className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            From the learner
          </p>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-primary">{booking.learnerNote}</p>
        </Card>
      )}

      <LiveRoom bookingId={booking.id} />

      {/* Only the tutor grades, and only for an evaluation booking. */}
      {booking.isTutor && booking.purpose === 'evaluation' && (
        <Card className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Your evaluation
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
            Same 0-100 scale the AI uses, so the two verdicts sit side by side.
          </p>

          <div className="mt-6 space-y-4">
            {SCORE_DIMENSIONS.map((d) => (
              <div key={d}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-dojo-text-primary">{DIMENSION_LABELS[d] ?? d}</span>
                  <span className="flex items-center gap-3">
                    {aiEval && (
                      <span className="text-xs text-dojo-text-muted">
                        AI: {aiEval[`${d}Score`] ?? '—'}
                      </span>
                    )}
                    <span className="font-semibold text-dojo-text-primary">{scores[d]}</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={scores[d]}
                  onChange={(e) => setScores((s) => ({ ...s, [d]: Number(e.target.value) }))}
                  className="w-full accent-[#2D3BC5]"
                  aria-label={DIMENSION_LABELS[d] ?? d}
                />
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm text-dojo-text-primary">How did the AI&apos;s assessment compare?</p>
            <div className="flex flex-wrap gap-2">
              {AGREEMENT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setAgreement(o.value)}
                  className={cn(
                    'rounded-(--radius-md) border px-4 py-2 text-sm transition-colors',
                    agreement === o.value
                      ? 'border-dojo-accent bg-dojo-accent text-white'
                      : 'border-dojo-border bg-dojo-surface text-dojo-text-primary hover:bg-dojo-surface-raised',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="notes" className="mb-2 block text-sm text-dojo-text-primary">
              Notes for the learner
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
              rows={4}
              maxLength={5000}
              placeholder="What they did well, and what to work on next…"
              className="w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none"
            />
          </div>

          {error && <p className="mt-4 text-sm text-dojo-danger">{error}</p>}

          <Button
            variant="primary"
            className="mt-6"
            loading={saving}
            disabled={saving}
            onClick={submitEvaluation}
          >
            <Check className="h-4 w-4" /> {saved ? 'Saved — update' : 'Save evaluation'}
          </Button>
        </Card>
      )}
    </div>
  );
}
