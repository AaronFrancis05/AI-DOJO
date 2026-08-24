/* ───────────────────────────────────────────────
   Tutor Detail — pick a slot and book.
   Consumes /api/tutors/[id]/availability + /api/bookings.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { TUTORS_ENABLED, BOOKING_DURATIONS_MINUTES } from '@/lib/tutors/config';
import { getTargetLangConfig } from '@/lib/language';
import { cn } from '@/lib/design-tokens';
import { ArrowLeft, Calendar, Check } from 'lucide-react';

interface Slot { startsAt: string; endsAt: string }

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function TutorDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = useUser();
  usePageTitle('Book a tutor');

  // Set when arriving from a session report — the booking then becomes a
  // request for a human read on that specific AI session.
  const sessionId = searchParams.get('session');
  const purpose = sessionId ? 'evaluation' : 'lesson';

  const [slots, setSlots] = useState<Slot[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  // Starts false when the feature is off, so the disabled path never has to
  // call setState from inside an effect just to stop a spinner.
  const [loading, setLoading] = useState(TUTORS_ENABLED);
  const [selected, setSelected] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const targetLanguage = user?.preferredTargetLanguage ?? 'ja';

  useEffect(() => {
    if (!TUTORS_ENABLED) return;
    fetch(`/api/tutors/${params.id}/availability`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (Array.isArray(body.slots)) setSlots(body.slots);
        if (body.timezone) setTimezone(body.timezone);
        if (body.error) setError(body.error);
      })
      .catch(() => setError('Could not load availability.'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dayKey(s.startsAt);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots]);

  const book = useCallback(async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tutorId: Number(params.id),
          scheduledAt: selected,
          durationMinutes: duration,
          targetLanguage,
          purpose,
          sessionId: sessionId ? Number(sessionId) : undefined,
          learnerNote: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not create the booking.');
      router.push('/tutors');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the booking.');
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, params.id, duration, targetLanguage, purpose, sessionId, note, router]);

  if (!TUTORS_ENABLED) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="py-12 text-center">
          <p className="text-sm text-dojo-text-muted">Live tutoring is not available yet.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <button
        type="button"
        onClick={() => router.push('/tutors')}
        className="mb-6 inline-flex items-center gap-1 text-sm text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to tutors
      </button>

      {purpose === 'evaluation' && (
        <Card className="mb-6 border-dojo-accent/30">
          <p className="text-sm leading-relaxed text-dojo-text-primary">
            <span className="font-semibold">Evaluation booking.</span> The tutor will review
            the session you just completed and give their own assessment alongside the AI&apos;s.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
          Pick a time
        </h2>
        <p className="mt-1 text-xs text-dojo-text-muted">
          Times shown in your local timezone · tutor is in {timezone}
        </p>

        {loading ? (
          <div className="mt-6 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-dojo-surface-raised" />
            ))}
          </div>
        ) : byDay.length === 0 ? (
          <p className="mt-6 text-sm text-dojo-text-muted">
            This tutor has no open slots in the next two weeks.
          </p>
        ) : (
          <div className="mt-6 space-y-5">
            {byDay.map(([day, daySlots]) => (
              <div key={day}>
                <p className="mb-2 text-sm font-semibold text-dojo-text-primary">{day}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setSelected(s.startsAt)}
                      className={cn(
                        'rounded-[--radius-md] border px-4 py-2 text-sm transition-colors',
                        selected === s.startsAt
                          ? 'border-dojo-accent bg-dojo-accent text-white'
                          : 'border-dojo-border bg-dojo-surface text-dojo-text-primary hover:bg-dojo-surface-raised',
                      )}
                    >
                      {timeLabel(s.startsAt)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selected && (
        <Card className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Session details
          </h2>

          <div className="mt-4">
            <p className="mb-2 text-sm text-dojo-text-primary">How long?</p>
            <div className="flex flex-wrap gap-2">
              {BOOKING_DURATIONS_MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  className={cn(
                    'rounded-[--radius-md] border px-4 py-2 text-sm transition-colors',
                    duration === m
                      ? 'border-dojo-accent bg-dojo-accent text-white'
                      : 'border-dojo-border bg-dojo-surface text-dojo-text-primary hover:bg-dojo-surface-raised',
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="note" className="mb-2 block text-sm text-dojo-text-primary">
              Anything they should know? <span className="text-dojo-text-muted">(optional)</span>
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What you'd like to work on…"
              className="w-full rounded-[--radius-md] border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Badge variant="outline">{getTargetLangConfig(targetLanguage).name}</Badge>
            <span className="text-xs text-dojo-text-muted">
              {new Date(selected).toLocaleString()}
            </span>
          </div>

          {error && <p className="mt-4 text-sm text-dojo-danger">{error}</p>}

          <Button
            variant="primary"
            className="mt-6 w-full"
            loading={submitting}
            disabled={submitting}
            onClick={book}
          >
            {submitting ? <Calendar className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            Request this slot
          </Button>
          <p className="mt-2 text-xs text-dojo-text-muted">
            The tutor confirms before the session goes ahead.
          </p>
        </Card>
      )}
    </div>
  );
}
