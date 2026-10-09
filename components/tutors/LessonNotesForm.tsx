/* ───────────────────────────────────────────────
   LessonNotesForm — the tutor's write-up after a 1:1 lesson (PLAN.md 4.2,
   4.7): notes and corrections, which the AI turns into the learner's
   homework, and the unit's can-do statements marked introduced / practised /
   achieved for the learner's progress map.
   Consumes /api/bookings/[id]/notes and /api/bookings/[id]/can-do.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CAN_DO_STATUSES, type CanDoStatus } from '@/lib/courses/syllabus';
import type { LessonCorrection } from '@/lib/tutors/lesson-notes';
import { cn } from '@/lib/design-tokens';
import { Check, Plus, Trash2 } from 'lucide-react';

const inputClass =
  'w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary';

export interface CanDoUnit {
  id: number;
  title: string;
  canDo: { index: number; text: string; status: CanDoStatus | null }[];
}

export function LessonNotesForm({ bookingId, unit }: { bookingId: number; unit: CanDoUnit | null }) {
  const [notes, setNotes] = useState('');
  const [corrections, setCorrections] = useState<LessonCorrection[]>([]);
  const [filedAt, setFiledAt] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<number, CanDoStatus | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/${bookingId}/notes`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.success) return;
        setNotes(body.notes ?? '');
        setCorrections(body.corrections ?? []);
        setFiledAt(body.filedAt ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId]);

  // Seeded from the briefing's standing, then owned by this form.
  const [seededUnit, setSeededUnit] = useState<number | null>(null);
  if (unit && seededUnit !== unit.id) {
    setSeededUnit(unit.id);
    setStatuses(Object.fromEntries(unit.canDo.map((c) => [c.index, c.status])));
  }

  const file = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/notes`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes, corrections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not file the notes.');
      setCorrections(data.corrections);
      setFiledAt(data.filedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file the notes.');
    } finally {
      setBusy(false);
    }
  };

  const mark = async (statementIndex: number, status: CanDoStatus) => {
    if (!unit) return;
    const previous = statuses[statementIndex] ?? null;
    setStatuses((s) => ({ ...s, [statementIndex]: status }));
    const res = await fetch(`/api/bookings/${bookingId}/can-do`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unitId: unit.id, statementIndex, status }),
    }).catch(() => null);
    if (!res?.ok) {
      setStatuses((s) => ({ ...s, [statementIndex]: previous }));
      setError('Could not save that mark.');
    }
  };

  const setCorrection = (i: number, patch: Partial<LessonCorrection>) =>
    setCorrections((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Card className="!p-5">
      <h2 className="text-sm font-bold text-dojo-text-primary">After the lesson</h2>
      <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
        Your notes and corrections become the learner&apos;s homework: the AI turns them into drills and
        dialogues in their own language.
      </p>

      <label htmlFor="lesson-notes" className="mt-4 block text-sm text-dojo-text-primary">What you taught, and what to practise</label>
      <textarea
        id="lesson-notes"
        rows={4}
        maxLength={4000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className={`${inputClass} mt-2`}
      />

      <div className="mt-4 space-y-2">
        <p className="text-sm text-dojo-text-primary">Corrections you made</p>
        {corrections.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input aria-label="What they said" placeholder="What they said" value={c.original} onChange={(e) => setCorrection(i, { original: e.target.value })} className={inputClass} />
            <input aria-label="Corrected" placeholder="Corrected" value={c.corrected} onChange={(e) => setCorrection(i, { corrected: e.target.value })} className={inputClass} />
            <input aria-label="Why" placeholder="Why (optional)" value={c.note} onChange={(e) => setCorrection(i, { note: e.target.value })} className={inputClass} />
            <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setCorrections((list) => list.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setCorrections((list) => [...list, { original: '', corrected: '', note: '' }])}>
          <Plus className="h-4 w-4" /> Add a correction
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button variant="primary" loading={busy} onClick={file}>
          {filedAt ? 'Update notes' : 'File notes'}
        </Button>
        {filedAt && (
          <span className="flex items-center gap-1 text-xs text-dojo-success">
            <Check className="h-3.5 w-3.5" /> Filed — homework is on its way to the learner
          </span>
        )}
      </div>

      {unit && unit.canDo.length > 0 && (
        <div className="mt-6 border-t border-dojo-border pt-4">
          <p className="text-sm text-dojo-text-primary">{unit.title}: can-do statements</p>
          <ul className="mt-2 space-y-3">
            {unit.canDo.map((c) => (
              <li key={c.index}>
                <p className="text-sm leading-relaxed text-dojo-text-muted">{c.text}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {CAN_DO_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => mark(c.index, status)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs capitalize transition-colors',
                        statuses[c.index] === status
                          ? 'border-dojo-accent bg-dojo-accent text-white'
                          : 'border-dojo-border text-dojo-text-muted hover:border-dojo-accent',
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-dojo-danger">{error}</p>}
    </Card>
  );
}
