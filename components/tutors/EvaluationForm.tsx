/* ───────────────────────────────────────────────
   EvaluationForm — the tutor's verdict, on the AI's own six dimensions.

   Extracted from the booking page so the assessment room grades through the
   same form rather than a second copy of it. The two differ only in where
   they POST and what extra identity they send with it, which is what the
   `endpoint` / `extraBody` props are for.

   The scale is deliberately the AI's `SCORE_DIMENSIONS`, 0-100, so a human
   verdict and a machine one can be shown side by side without a conversion
   step nobody would remember to apply.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SCORE_DIMENSIONS } from '@/lib/ai-engine';
import { cn } from '@/lib/design-tokens';
import { Check } from 'lucide-react';

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

export interface EvaluationFormInitial {
  scores?: Record<string, number>;
  agreesWithAi?: string | null;
  notes?: string;
  saved?: boolean;
}

interface EvaluationFormProps {
  /** POST target. */
  endpoint: string;
  /** Merged into the request body — e.g. which learner is being graded. */
  extraBody?: Record<string, unknown>;
  /** The AI's scores for the same learner, shown beside each slider. */
  aiScores?: Record<string, number> | null;
  initial?: EvaluationFormInitial;
  onSaved?: () => void;
  className?: string;
}

export function EvaluationForm({
  endpoint,
  extraBody,
  aiScores,
  initial,
  onSaved,
  className,
}: EvaluationFormProps) {
  const [scores, setScores] = useState<Record<string, number>>(
    () =>
      initial?.scores ?? Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, 70])),
  );
  const [agreement, setAgreement] = useState<string | null>(initial?.agreesWithAi ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(initial?.saved));
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...extraBody, scores, agreesWithAi: agreement, notes }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Could not save.');
      }
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the evaluation.');
    } finally {
      setSaving(false);
    }
  }, [endpoint, extraBody, scores, agreement, notes, onSaved]);

  return (
    <div className={className}>
      <div className="space-y-4">
        {SCORE_DIMENSIONS.map((d) => (
          <div key={d}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-dojo-text-primary">{DIMENSION_LABELS[d] ?? d}</span>
              <span className="flex items-center gap-3">
                {aiScores && (
                  <span className="text-xs text-dojo-text-muted">
                    AI: {aiScores[`${d}Score`] ?? '—'}
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
              onChange={(e) => {
                setScores((s) => ({ ...s, [d]: Number(e.target.value) }));
                setSaved(false);
              }}
              className="w-full accent-[#2D3BC5]"
              aria-label={DIMENSION_LABELS[d] ?? d}
            />
          </div>
        ))}
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm text-dojo-text-primary">
          How did the AI&apos;s assessment compare?
        </p>
        <div className="flex flex-wrap gap-2">
          {AGREEMENT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { setAgreement(o.value); setSaved(false); }}
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
        <label htmlFor={`notes-${endpoint}`} className="mb-2 block text-sm text-dojo-text-primary">
          Notes for the learner
        </label>
        <textarea
          id={`notes-${endpoint}`}
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
        onClick={submit}
      >
        <Check className="h-4 w-4" /> {saved ? 'Saved — update' : 'Save evaluation'}
      </Button>
    </div>
  );
}
