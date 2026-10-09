/* ───────────────────────────────────────────────
   LessonPanel — the slides beside the video in a 1:1 lesson (PLAN.md 4.8
   part 3), synced between tutor and learner over lib/realtime.

   Each slide shows the English phrase with the learner's own native-language
   translation underneath, so a learner who shares no language with the tutor
   can still read what it means. The tutor moves the panel; the learner's
   follows. The learner also gets "Explain in my language" (part 5): a private
   two-sentence explanation of the tutor's last captioned line, or of the
   slide. The tutor only sees that someone asked — their cue to slow down.
   Consumes /api/bookings/[id]/lesson-plan and /api/bookings/[id]/explain.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useRealtimeTopics } from '@/lib/realtime/context';
import { topics } from '@/lib/realtime/topics';
import type { LessonSlide } from '@/lib/tutors/lesson-plan';
import { ChevronLeft, ChevronRight, HelpCircle, Languages } from 'lucide-react';

interface PanelState {
  slides: LessonSlide[];
  currentSlide: number;
}

export function LessonPanel({
  bookingId,
  isTutor,
  lastCaption,
}: {
  bookingId: number;
  isTutor: boolean;
  /** The tutor's latest captioned line, original text — what "Explain" explains first. */
  lastCaption?: string | null;
}) {
  const [state, setState] = useState<PanelState | null>(null);
  const [explanation, setExplanation] = useState<{ source: string; text: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      fetch(`/api/bookings/${bookingId}/lesson-plan`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (!body?.success) return;
          setState({
            slides: (isTutor ? body.plan?.slides : body.slides) ?? [],
            currentSlide: body.currentSlide ?? 0,
          });
        })
        .catch(() => {}),
    [bookingId, isTutor],
  );

  useEffect(() => { void load(); }, [load]);

  useRealtimeTopics([topics.booking(bookingId)], {
    onEvent: (event) => {
      if (event.type === 'booking.plan') void load();
      if (event.type === 'booking.explain' && isTutor) setAskedAt(Date.now());
    },
    onSync: load,
  });

  // The "asked for an explanation" cue fades after a while on its own.
  useEffect(() => {
    if (askedAt === null) return;
    const id = window.setTimeout(() => setAskedAt(null), 20_000);
    return () => window.clearTimeout(id);
  }, [askedAt]);

  const move = async (delta: number) => {
    if (!state) return;
    const next = state.currentSlide + delta;
    if (next < 0 || next >= state.slides.length) return;
    setState({ ...state, currentSlide: next });
    await fetch(`/api/bookings/${bookingId}/lesson-plan`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentSlide: next }),
    }).catch(() => {});
  };

  const explain = async () => {
    setExplaining(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/explain`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(lastCaption ? { text: lastCaption } : { slide: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not explain that.');
      setExplanation({ source: data.source, text: data.explanation });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not explain that.');
    } finally {
      setExplaining(false);
    }
  };

  if (!state) return null;
  const slide = state.slides[state.currentSlide];

  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">Lesson panel</h2>
        {state.slides.length > 0 && (
          <span className="text-xs tabular-nums text-dojo-text-muted">
            {state.currentSlide + 1} / {state.slides.length}
          </span>
        )}
      </div>

      {slide ? (
        <div className="mt-4 text-center">
          <p translate="no" className="text-2xl font-bold leading-tight tracking-tight text-dojo-text-primary">
            {slide.phrase}
          </p>
          {!isTutor && slide.translation && (
            <p className="mt-2 text-base leading-relaxed text-dojo-text-muted">{slide.translation}</p>
          )}
          {isTutor && slide.cue && (
            <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">Cue: {slide.cue}</p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-dojo-text-muted">
          {isTutor ? 'Draft the lesson plan to fill the panel.' : 'Your tutor has not prepared slides for this lesson.'}
        </p>
      )}

      {isTutor && state.slides.length > 0 && (
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" variant="secondary" disabled={state.currentSlide === 0} onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button size="sm" variant="secondary" disabled={state.currentSlide >= state.slides.length - 1} onClick={() => move(1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isTutor && askedAt !== null && (
        <p className="mt-4 flex items-center gap-2 rounded-(--radius-md) bg-dojo-surface-raised px-3 py-2 text-sm text-dojo-text-primary" role="status">
          <HelpCircle className="h-4 w-4 shrink-0 text-dojo-warning" />
          Your learner asked for an explanation. Slow down or show it another way.
        </p>
      )}

      {!isTutor && (
        <div className="mt-4 border-t border-dojo-border pt-4">
          <Button size="sm" variant="secondary" loading={explaining} disabled={!lastCaption && !slide} onClick={explain}>
            <Languages className="h-4 w-4" /> Explain in my language
          </Button>
          {explanation && (
            <div className="mt-3 space-y-1">
              <p translate="no" className="text-xs text-dojo-text-muted">“{explanation.source}”</p>
              <p className="text-sm leading-relaxed text-dojo-text-primary">{explanation.text}</p>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-dojo-danger">{error}</p>}
        </div>
      )}
    </Card>
  );
}
