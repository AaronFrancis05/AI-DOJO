/* ───────────────────────────────────────────────
   LessonPlanEditor — the tutor's plan for one 1:1 lesson (PLAN.md 4.7).
   The AI drafts it from the learner's next syllabus step, top weak points
   and CEFR level; the tutor edits what happens in each phase. The template
   (and its timings) is fixed. Consumes /api/bookings/[id]/lesson-plan.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { LessonPlan } from '@/lib/tutors/lesson-plan';
import { NotebookPen, Sparkles } from 'lucide-react';

const inputClass =
  'w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary';

export function LessonPlanEditor({ bookingId }: { bookingId: number }) {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [edited, setEdited] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/${bookingId}/lesson-plan`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        setLoaded(true);
        if (body?.success) {
          setPlan(body.plan ?? null);
          setEdited(Boolean(body.tutorEdited));
        }
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [bookingId]);

  const draft = async (replace: boolean) => {
    if (replace && !window.confirm('Redraft the plan? Your edits will be replaced.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/lesson-plan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'The plan could not be drafted.');
      setPlan(data.plan);
      setEdited(false);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The plan could not be drafted.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/lesson-plan`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save.');
      setPlan(data.plan);
      setEdited(true);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const update = (next: LessonPlan) => {
    setPlan(next);
    setDirty(true);
  };

  if (!loaded) return null;

  return (
    <Card className="!p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
          <NotebookPen className="h-4 w-4 shrink-0 text-dojo-accent" />
          Lesson plan
          {plan?.unit && <Badge variant="outline">{plan.unit.cefrLevel} · {plan.unit.title}</Badge>}
          {edited && <Badge variant="accent">Edited</Badge>}
        </h2>
        <div className="flex gap-2">
          {plan && dirty && (
            <Button size="sm" variant="primary" loading={busy} onClick={save}>Save</Button>
          )}
          <Button size="sm" variant="secondary" loading={busy && !dirty} onClick={() => draft(edited)}>
            <Sparkles className="h-4 w-4" /> {plan ? 'Redraft' : 'Draft with AI'}
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-dojo-danger">{error}</p>}

      {!plan ? (
        <p className="mt-4 text-sm leading-relaxed text-dojo-text-muted">
          The AI drafts the lesson from the learner&apos;s next syllabus step, with a personal fix slot for
          their recurring mistakes. You edit it before the lesson.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {plan.objectives.length > 0 && (
            <ul className="list-disc space-y-1 ps-6 text-sm leading-relaxed text-dojo-text-primary">
              {plan.objectives.map((o) => <li key={o}>{o}</li>)}
            </ul>
          )}
          {plan.explanationNotes && (
            <p className="text-sm leading-relaxed text-dojo-text-muted">{plan.explanationNotes}</p>
          )}

          {plan.phases.map((phase, i) => (
            <div key={phase.key}>
              <label htmlFor={`phase-${phase.key}`} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-dojo-text-primary">
                {phase.title}
                <span className="text-xs font-normal tabular-nums text-dojo-text-muted">{phase.minutes} min</span>
              </label>
              <textarea
                id={`phase-${phase.key}`}
                rows={Math.max(2, phase.activities.length)}
                value={phase.activities.join('\n')}
                onChange={(e) => {
                  const phases = [...plan.phases];
                  phases[i] = { ...phase, activities: e.target.value.split('\n') };
                  update({ ...plan, phases });
                }}
                className={`${inputClass} mt-2`}
              />
              {phase.key === 'fix_slot' && plan.fixSlot.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-dojo-text-muted">
                  {plan.fixSlot.map((f) => <li key={f.pattern}><span className="font-semibold">{f.pattern}:</span> {f.exercise}</li>)}
                </ul>
              )}
            </div>
          ))}

          <div>
            <label htmlFor="plan-roleplay" className="text-sm font-semibold text-dojo-text-primary">Role-play</label>
            <textarea
              id="plan-roleplay"
              rows={2}
              value={plan.rolePlay}
              onChange={(e) => update({ ...plan, rolePlay: e.target.value })}
              className={`${inputClass} mt-2`}
            />
          </div>
          <div>
            <label htmlFor="plan-homework" className="text-sm font-semibold text-dojo-text-primary">Homework</label>
            <textarea
              id="plan-homework"
              rows={2}
              value={plan.homework}
              onChange={(e) => update({ ...plan, homework: e.target.value })}
              className={`${inputClass} mt-2`}
            />
          </div>
          <p className="text-xs text-dojo-text-muted">
            {plan.slides.length} slides for the lesson panel · {Math.round(plan.fixShare * 100)}% of the time on personal fixes
          </p>
        </div>
      )}
    </Card>
  );
}
