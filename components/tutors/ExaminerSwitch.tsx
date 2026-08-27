/* ───────────────────────────────────────────────
   ExaminerSwitch — the tutor hands the room over, or takes it back.

   Lives on the assessment page rather than only in the scheduling form
   because of when the decision is actually made: a tutor schedules an
   assessment intending to run it, and finds out afterwards that they cannot.
   This is the control they reach for at that moment.

   The brief is tutor-only, on the wire as well as on screen — `/api/
   assessments/[id]` returns it to the tutor and null to everyone else.
   Knowing what the examiner has been told to probe is knowing the paper.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { interviewerChoices } from '@/lib/interview/persona';
import { cn } from '@/lib/design-tokens';
import { Bot, Check, UserRound } from 'lucide-react';

interface ExaminerSwitchProps {
  assessmentId: number;
  examiner: string;
  aiInterviewerAvatarId: string | null;
  aiInterviewerBrief: string | null;
  /** Refetch the assessment once the change lands. */
  onChanged: () => void;
  className?: string;
}

const CHOICES = interviewerChoices();

export function ExaminerSwitch({
  assessmentId,
  examiner,
  aiInterviewerAvatarId,
  aiInterviewerBrief,
  onChanged,
  className,
}: ExaminerSwitchProps) {
  const [open, setOpen] = useState(false);
  const [avatarId, setAvatarId] = useState(aiInterviewerAvatarId ?? CHOICES[0].avatarId);
  const [brief, setBrief] = useState(aiInterviewerBrief ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAi = examiner === 'ai';

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      setError('');
      try {
        const res = await fetch(`/api/assessments/${assessmentId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'That did not work.');
        setOpen(false);
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not work.');
      } finally {
        setSaving(false);
      }
    },
    [assessmentId, onChanged],
  );

  const inputClass =
    'w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none';

  return (
    <Card className={cn('!p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
            {isAi ? (
              <Bot className="h-4 w-4 shrink-0 text-dojo-accent" />
            ) : (
              <UserRound className="h-4 w-4 shrink-0 text-dojo-accent" />
            )}
            {isAi ? 'The AI examiner is running this' : 'You are examining this'}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-dojo-text-muted">
            {isAi
              ? 'Each learner sits their own spoken interview and is marked on the same six dimensions you use. You read the transcripts and can mark them yourself afterwards.'
              : 'If you cannot make it, hand the room to the AI examiner. Learners sit a spoken interview instead of waiting in a queue for you.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setOpen((was) => !was)}>
            {isAi ? 'Edit the brief' : 'Hand it to the AI examiner'}
          </Button>
          {isAi && (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => patch({ examiner: 'tutor' })}
            >
              Take it back
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-6 space-y-4 border-t border-dojo-border pt-6">
          <div>
            <p className="mb-2 text-sm text-dojo-text-primary">Who examines</p>
            <div className="flex flex-wrap gap-3">
              {CHOICES.map((choice) => (
                <button
                  key={choice.avatarId}
                  type="button"
                  onClick={() => setAvatarId(choice.avatarId)}
                  aria-pressed={avatarId === choice.avatarId}
                  className={cn(
                    'relative w-20 rounded-(--radius-md) border p-2 text-center transition-colors',
                    avatarId === choice.avatarId
                      ? 'border-dojo-accent bg-dojo-accent-soft/40'
                      : 'border-dojo-border hover:border-dojo-accent',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- catalogue portrait, fixed local asset */}
                  <img
                    src={choice.imageSrc}
                    alt=""
                    className="mx-auto h-12 w-12 rounded-full object-cover"
                  />
                  <span className="mt-2 block truncate text-[11px] text-dojo-text-primary">
                    {choice.name}
                  </span>
                  {avatarId === choice.avatarId && (
                    <Check className="absolute right-1 top-1 h-3.5 w-3.5 text-dojo-accent" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="examiner-brief" className="mb-2 block text-sm text-dojo-text-primary">
              Your brief to the examiner <span className="text-dojo-text-muted">(optional)</span>
            </label>
            <textarea
              id="examiner-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Push them on past-tense forms and on keigo when they order. Don't dwell on numbers — we covered those last week."
              className={inputClass}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-dojo-text-muted">
              Learners never see this. It is locked into each learner&apos;s session, so nothing
              they say during the interview can change it.
            </p>
          </div>

          {error && <p className="text-sm text-dojo-danger">{error}</p>}

          <Button
            variant="primary"
            loading={saving}
            disabled={saving}
            onClick={() =>
              patch({
                examiner: 'ai',
                aiInterviewerAvatarId: avatarId,
                aiInterviewerBrief: brief.trim() || null,
              })
            }
          >
            {isAi ? 'Save the brief' : 'Hand it over'}
          </Button>
        </div>
      )}
    </Card>
  );
}
