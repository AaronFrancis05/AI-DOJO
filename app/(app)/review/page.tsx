/* ───────────────────────────────────────────────
   Review — spaced-repetition drill over words the
   learner has met in sessions.
   Consumes /api/review/due + /api/review/answer.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { getBCP47 } from '@/lib/language';
import { speakWithVisemes, unlockAudio } from '@/lib/roleplay/tts';
import { cn } from '@/lib/design-tokens';
import { Volume2, RotateCcw, Check, Sparkles, ArrowRight } from 'lucide-react';

interface DueCard {
  id: number;
  vocabularyId: number;
  targetText: string;
  phonetic: string | null;
  translation: string;
  category: string | null;
  usageTip: string | null;
  state: string;
  intervalDays: number;
  reviewCount: number;
}

/**
 * How the learner grades their own recall, mapped to the SM-2 quality values
 * that /api/review/answer expects.
 *
 * Three buttons rather than SM-2's full 0-5: asking someone to rate their own
 * recall on a six-point scale mid-drill is a decision they can't make quickly,
 * and the extra resolution doesn't change the schedule much. The values chosen
 * land on the meaningful branches of the algorithm — below 3 lapses the card,
 * 3 keeps it moving, 5 stretches the interval.
 */
const GRADES = [
  { quality: 1, label: 'Forgot', hint: 'See it again soon', variant: 'danger' as const },
  { quality: 3, label: 'Hard', hint: 'Got there eventually', variant: 'secondary' as const },
  { quality: 5, label: 'Easy', hint: 'Knew it instantly', variant: 'primary' as const },
];

export default function ReviewPage() {
  usePageTitle('Review');
  const router = useRouter();
  const user = useUser();
  const targetLanguage = user?.preferredTargetLanguage ?? 'ja';

  const [cards, setCards] = useState<DueCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [graded, setGraded] = useState(0);
  const [lapsed, setLapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/review/due', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (Array.isArray(body.cards)) setCards(body.cards);
        else setError(body.error ?? 'Could not load your review queue.');
      })
      .catch(() => { if (!cancelled) setError('Could not load your review queue.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const current = cards[index];
  const total = cards.length;
  const isDone = !loading && total > 0 && index >= total;

  const speak = useCallback(() => {
    if (!current) return;
    unlockAudio();
    speakWithVisemes(current.targetText, getBCP47(targetLanguage, 'tts')).catch(() => {});
  }, [current, targetLanguage]);

  // Hearing the word is most of the value of reviewing it, so play it as soon
  // as the answer is revealed rather than making it an extra click.
  useEffect(() => {
    if (revealed) speak();
  }, [revealed, speak]);

  const grade = useCallback(async (quality: number) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      // A rejected save must not advance the drill: the card would be counted
      // as reviewed here while its schedule was never written server-side.
      const res = await fetch('/api/review/answer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cardId: current.id, quality }),
      });
      if (!res.ok) throw new Error('save failed');
      setGraded((n) => n + 1);
      if (quality < 3) setLapsed((n) => n + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
    } catch {
      setError('That answer did not save. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [current, submitting]);

  const progressPct = useMemo(
    () => (total === 0 ? 0 : Math.round((index / total) * 100)),
    [index, total],
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="animate-pulse">
          <div className="h-4 w-24 rounded bg-dojo-surface-raised" />
          <div className="mt-6 h-10 w-2/3 rounded bg-dojo-surface-raised" />
          <div className="mt-4 h-4 w-1/3 rounded bg-dojo-surface-raised" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="text-center py-12">
          <p className="text-sm text-dojo-text-muted">{error}</p>
          <Button variant="secondary" className="mt-6" onClick={() => router.refresh()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  // Nothing due is a good outcome, not an empty state to apologise for.
  if (total === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="text-center py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dojo-success/10">
            <Check className="h-6 w-6 text-dojo-success" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-dojo-text-primary">
            Nothing due right now
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
            Words you practise in a session show up here when it&apos;s time to see them again.
          </p>
          <Button variant="primary" className="mt-6" onClick={() => router.push('/hub')}>
            <ArrowRight className="h-4 w-4" /> Start a session
          </Button>
        </Card>
      </div>
    );
  }

  if (isDone) {
    const recalled = graded - lapsed;
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className="text-center py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dojo-accent/10">
            <Sparkles className="h-6 w-6 text-dojo-accent" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-dojo-text-primary">
            Review complete
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
            {recalled} of {graded} recalled.{' '}
            {lapsed > 0
              ? `The ${lapsed} you missed will come back tomorrow.`
              : 'Everything you saw is scheduled further out.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => router.push('/home')}>Back to home</Button>
            <Button variant="primary" onClick={() => router.push('/hub')}>
              <ArrowRight className="h-4 w-4" /> Practise a scenario
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="hidden text-2xl font-bold tracking-tight text-dojo-text-primary md:block">
            Review
          </h1>
          <span className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            {index + 1} of {total}
          </span>
        </div>
        <ProgressBar value={progressPct} color="accent" size="sm" />
      </div>

      <Card className="min-h-88">
        <div className="mb-6 flex items-center gap-2">
          {current.category && (
            <Badge variant="outline" className="capitalize">{current.category}</Badge>
          )}
          {current.state === 'relearning' && (
            <Badge variant="default">
              <RotateCcw className="mr-1 inline h-3 w-3" /> Relearning
            </Badge>
          )}
          {current.reviewCount > 0 && (
            <span className="text-xs text-dojo-text-muted">
              Seen {current.reviewCount}×
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-3xl font-bold leading-tight tracking-tight text-dojo-text-primary">
              {current.targetText}
            </p>
            {current.phonetic && (
              <p className="mt-2 text-base text-dojo-text-muted">{current.phonetic}</p>
            )}
          </div>
          <button
            type="button"
            onClick={speak}
            aria-label="Play pronunciation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dojo-border text-dojo-text-muted transition-colors hover:border-dojo-accent/40 hover:text-dojo-text-primary"
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>

        {!revealed ? (
          <div className="mt-10">
            <p className="mb-4 text-sm text-dojo-text-muted">
              Do you remember what this means?
            </p>
            <Button variant="secondary" className="w-full" onClick={() => setRevealed(true)}>
              Show answer
            </Button>
          </div>
        ) : (
          <div className="mt-8">
            <div className="rounded-(--radius-md) border border-dojo-border/60 bg-dojo-surface-raised p-4">
              <p className="text-base leading-relaxed text-dojo-text-primary">
                {current.translation}
              </p>
              {current.usageTip && (
                <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
                  {current.usageTip}
                </p>
              )}
            </div>

            <p className="mt-6 mb-3 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
              How well did you know it?
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {GRADES.map((g) => (
                <button
                  key={g.quality}
                  type="button"
                  disabled={submitting}
                  onClick={() => grade(g.quality)}
                  className={cn(
                    'rounded-(--radius-md) border px-4 py-3 text-left transition-colors disabled:opacity-50',
                    g.variant === 'danger' && 'border-dojo-danger/30 bg-dojo-danger/10 hover:bg-dojo-danger/20',
                    g.variant === 'secondary' && 'border-dojo-border bg-dojo-surface hover:bg-dojo-surface-raised',
                    g.variant === 'primary' && 'border-dojo-success/30 bg-dojo-success/10 hover:bg-dojo-success/20',
                  )}
                >
                  <span className="block text-sm font-semibold text-dojo-text-primary">{g.label}</span>
                  <span className="block text-xs text-dojo-text-muted">{g.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
