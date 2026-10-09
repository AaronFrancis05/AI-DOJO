'use client';

/* ───────────────────────────────────────────────
   The vetting evidence on one tutor application (PLAN.md 4.6): the CEFR
   proficiency interview, the clarity read-aloud, the teaching module, and the
   trial-lesson rubric the admin scores here. Also the ongoing-quality flag and
   the numbers behind the learner-side trust badge. Verification is refused
   server-side while any gap remains; this panel says which.
   ─────────────────────────────────────────────── */

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { adminInputClass } from '@/components/admin/shared';
import { TRIAL_RUBRIC_KEYS, type TrialLessonScores } from '@/lib/tutors/quality-rules';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export interface AdminTutorVetting {
  cefrLevel: string | null;
  proficiencyPassed: boolean;
  clarityScore: number | null;
  trialScores: TrialLessonScores | null;
  teachingModuleCompleted: boolean;
  gaps: string[];
}

export interface AdminTutorTrust {
  reviewCount: number;
  averageRating: number | null;
  evaluationCount: number;
  agreementRate: number | null;
  completedLessons: number;
}

const RUBRIC_LABELS: Record<(typeof TRIAL_RUBRIC_KEYS)[number], string> = {
  correctionQuality: 'Correction quality',
  talkTimeBalance: 'Talk-time balance',
  levelAdaptation: 'Level adaptation',
};

export function TutorVettingSection({
  vetting,
  trust,
  reviewFlagReason,
  saving,
  onSave,
}: {
  vetting: AdminTutorVetting;
  trust: AdminTutorTrust | null;
  reviewFlagReason: string | null;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [trial, setTrial] = useState<Record<string, string>>(() =>
    Object.fromEntries(TRIAL_RUBRIC_KEYS.map((k) => [k, vetting.trialScores ? String(vetting.trialScores[k]) : ''])),
  );

  const rowClass = 'flex items-center justify-between gap-4 text-sm';

  return (
    <div className="mt-6 grid gap-6 border-t border-dojo-border pt-6 md:grid-cols-2">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Vetting
        </h3>
        <p className={rowClass}>
          <span className="text-dojo-text-muted">Proficiency interview</span>
          <Badge variant={vetting.proficiencyPassed ? 'success' : 'outline'}>
            {vetting.cefrLevel ?? 'not taken'}
          </Badge>
        </p>
        <p className={rowClass}>
          <span className="text-dojo-text-muted">Clarity (self-measured)</span>
          <span className="tabular-nums text-dojo-text-primary">{vetting.clarityScore ?? '—'}</span>
        </p>
        <p className={rowClass}>
          <span className="text-dojo-text-muted">Teaching module</span>
          <span className="text-dojo-text-primary">{vetting.teachingModuleCompleted ? 'Completed' : 'Not yet'}</span>
        </p>
        {vetting.gaps.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {vetting.gaps.map((gap) => (
              <li key={gap} className="flex items-start gap-2 text-xs leading-relaxed text-dojo-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {gap}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-dojo-success">Every check has passed.</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
          Trial lesson (1–5 each)
        </h3>
        {TRIAL_RUBRIC_KEYS.map((key) => (
          <label key={key} className={rowClass}>
            <span className="text-dojo-text-muted">{RUBRIC_LABELS[key]}</span>
            <input
              type="number"
              min={1}
              max={5}
              value={trial[key]}
              onChange={(e) => setTrial((t) => ({ ...t, [key]: e.target.value }))}
              className={`${adminInputClass} w-20`}
            />
          </label>
        ))}
        <Button
          size="sm"
          variant="secondary"
          loading={saving}
          disabled={TRIAL_RUBRIC_KEYS.some((k) => !trial[k])}
          onClick={() =>
            onSave({ trialLessonScores: Object.fromEntries(TRIAL_RUBRIC_KEYS.map((k) => [k, Number(trial[k])])) })
          }
        >
          Save trial scores
        </Button>

        {trust && (
          <p className="pt-2 text-xs leading-relaxed text-dojo-text-muted">
            {trust.completedLessons} lessons · {trust.averageRating != null ? `${trust.averageRating}★ from ${trust.reviewCount}` : 'no reviews'} ·{' '}
            {trust.agreementRate != null
              ? `${Math.round(trust.agreementRate * 100)}% AI agreement over ${trust.evaluationCount}`
              : 'no evaluations'}
          </p>
        )}
        {reviewFlagReason && (
          <div className="rounded-(--radius-md) border border-dojo-warning p-3">
            <p className="text-xs leading-relaxed text-dojo-text-primary">Flagged for re-review. {reviewFlagReason}</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => onSave({ clearReviewFlag: true })}>
              Mark re-reviewed
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
