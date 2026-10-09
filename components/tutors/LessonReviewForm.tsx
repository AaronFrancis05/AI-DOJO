/* ───────────────────────────────────────────────
   LessonReviewForm — the learner rates a 1:1 lesson once it has happened
   (PLAN.md 4.4). One review per booking, revisable. Ratings feed the trust
   badge and the tutor-quality threshold. Consumes /api/bookings/[id]/review.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/design-tokens';
import { Star } from 'lucide-react';

export function LessonReviewForm({ bookingId, tutorName }: { bookingId: number; tutorName: string }) {
  const [canReview, setCanReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/${bookingId}/review`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.success) return;
        setCanReview(Boolean(body.canReview));
        if (body.review) {
          setRating(body.review.rating);
          setComment(body.review.comment ?? '');
          setSaved(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId]);

  if (!canReview) return null;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/review`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save your review.');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="!p-5">
      <h2 className="text-sm font-bold text-dojo-text-primary">How was your lesson with {tutorName}?</h2>
      <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => { setRating(n); setSaved(false); }}
            className="p-1"
          >
            <Star className={cn('h-6 w-6', n <= rating ? 'fill-dojo-warning text-dojo-warning' : 'text-dojo-text-muted')} />
          </button>
        ))}
      </div>
      <textarea
        aria-label="Comment"
        rows={3}
        maxLength={2000}
        placeholder="What helped? What could be better? (optional)"
        value={comment}
        onChange={(e) => { setComment(e.target.value); setSaved(false); }}
        className="mt-4 w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary"
      />
      <div className="mt-4 flex items-center gap-4">
        <Button variant="primary" loading={busy} disabled={rating === 0 || saved} onClick={submit}>
          {saved ? 'Saved' : 'Submit review'}
        </Button>
        {error && <p className="text-sm text-dojo-danger">{error}</p>}
      </div>
    </Card>
  );
}
