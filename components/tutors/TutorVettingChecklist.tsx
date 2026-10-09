/* ───────────────────────────────────────────────
   TutorVettingChecklist — an applicant's own vetting steps (PLAN.md 4.6):
   1. the CEFR proficiency interview (C1+, no dimension below B2),
   2. the clarity read-aloud, scored for intelligibility, never accent,
   3. the teaching-method module and its check questions (PLAN.md 4.7),
   4. the recorded trial lesson, which the admin scores.
   Consumes /api/tutor/vetting and /api/placement?purpose=tutor_vetting.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AiInterviewStage } from '@/components/tutors/AiInterviewStage';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { assessPronunciation } from '@/lib/roleplay/pronunciation';
import { MIN_CLARITY_SCORE, type TrialLessonScores } from '@/lib/tutors/quality-rules';
import { TUTOR_MIN_CEFR } from '@/lib/interview/cefr';
import {
  CLARITY_PASSAGES,
  TEACHING_MODULE,
  TEACHING_MODULE_QUIZ,
} from '@/lib/tutors/vetting-content';
import type { InterviewerPersona } from '@/lib/interview/persona';
import { cn } from '@/lib/design-tokens';
import { Check, Mic, Loader2 } from 'lucide-react';

interface Vetting {
  cefrLevel: string | null;
  proficiencyPassed: boolean;
  proficiencyReason: string | null;
  clarityScore: number | null;
  trialScores: TrialLessonScores | null;
  teachingModuleCompleted: boolean;
  gaps: string[];
}

const START_BODY = { purpose: 'tutor_vetting' };

function StepHeading({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
          done ? 'bg-dojo-success text-white' : 'bg-dojo-surface-raised text-dojo-text-muted',
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      {title}
    </h2>
  );
}

function ClarityCheck({ onDone }: { onDone: (score: number) => Promise<void> }) {
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const read = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await assessPronunciation(CLARITY_PASSAGES[index], 'en-US');
      if (!result.transcript) {
        setError('Nothing was heard. Check your microphone and read the passage again.');
        return;
      }
      const next = [...scores, result.accuracyScore];
      setScores(next);
      if (index + 1 < CLARITY_PASSAGES.length) {
        setIndex(index + 1);
      } else {
        await onDone(Math.round(next.reduce((a, b) => a + b, 0) / next.length));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The microphone could not be used.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-dojo-text-muted">
        Passage {index + 1} of {CLARITY_PASSAGES.length}. Press the button, then read it aloud at a natural pace.
      </p>
      <p translate="no" className="rounded-(--radius-md) bg-dojo-surface-raised p-4 text-base leading-relaxed text-dojo-text-primary">
        {CLARITY_PASSAGES[index]}
      </p>
      <Button variant="primary" onClick={read} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        {busy ? 'Listening…' : 'Read aloud'}
      </Button>
      {error && <p className="text-sm text-dojo-danger">{error}</p>}
    </div>
  );
}

export function TutorVettingChecklist() {
  usePageTitle('Tutor vetting');
  const [vetting, setVetting] = useState<Vetting | null>(null);
  const [status, setStatus] = useState('');
  const [interviewer, setInterviewer] = useState<InterviewerPersona | null>(null);
  const [minutes, setMinutes] = useState(8);
  const [nextAttemptAt, setNextAttemptAt] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([
        fetch('/api/tutor/vetting', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/placement?purpose=tutor_vetting', { credentials: 'include' }).then((r) => r.json()),
      ])
        .then(([v, p]) => {
          if (v.success) {
            setVetting(v.vetting);
            setStatus(v.verificationStatus);
          } else {
            setError(v.error ?? 'Could not load your checklist.');
          }
          if (p.success) {
            setInterviewer(p.interviewer);
            setMinutes(p.minutes);
            setNextAttemptAt(p.nextAttemptAt);
          }
        })
        .catch(() => setError('Could not load your checklist.')),
    [],
  );

  useEffect(() => { void load(); }, [load]);

  const record = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/tutor/vetting', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save.');
      setVetting(data.vetting);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (!vetting) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        {error ? <p className="text-sm text-dojo-danger">{error}</p> : (
          <Card className="animate-pulse !p-5"><div className="h-40 rounded bg-dojo-surface-raised" /></Card>
        )}
      </div>
    );
  }

  const clarityDone = vetting.clarityScore != null && vetting.clarityScore >= MIN_CLARITY_SCORE;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-10">
      <div>
        <h1 className="hidden text-3xl font-bold leading-none tracking-tight text-dojo-text-primary md:block">
          Tutor vetting
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-dojo-text-muted">
          We approve tutors on evidence, not on where they are from. Learners see the results as your
          trust badge. {status === 'verified' && 'You are verified.'}
        </p>
      </div>

      {error && <p className="text-sm text-dojo-danger">{error}</p>}

      <Card className="!p-5">
        <StepHeading n={1} title="Proficiency interview" done={vetting.proficiencyPassed} />
        <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
          A spoken interview graded on the CEFR scale. Passing needs {TUTOR_MIN_CEFR} or higher overall, with
          no area below B2.
          {vetting.cefrLevel && ` Your result: ${vetting.cefrLevel}.`}
          {vetting.proficiencyReason && vetting.cefrLevel && ` ${vetting.proficiencyReason}`}
        </p>
        {!vetting.proficiencyPassed && interviewer && (
          nextAttemptAt ? (
            <p className="mt-4 text-sm text-dojo-text-muted">
              You can retake it from {new Date(nextAttemptAt).toLocaleDateString()}.
            </p>
          ) : (
            <div className="mt-4">
              <AiInterviewStage
                endpoint="/api/placement"
                startBody={START_BODY}
                interviewer={interviewer}
                minutesPerLearner={minutes}
                canJoin
                joinBlockedReason={null}
                alreadyTaken={false}
                onSubmitted={load}
                resultNote="Saved to your application. The admin sees the transcript and the level."
              />
            </div>
          )
        )}
      </Card>

      <Card className="!p-5">
        <StepHeading n={2} title="Clarity check" done={clarityDone} />
        <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
          Read {CLARITY_PASSAGES.length} short passages aloud. Speech recognition scores how clearly each word
          comes across — your accent is not scored, only whether you are easy to follow. Passing needs{' '}
          {MIN_CLARITY_SCORE}.{vetting.clarityScore != null && ` Your score: ${vetting.clarityScore}.`}
        </p>
        {!clarityDone && <ClarityCheck onDone={(score) => record({ clarityScore: score })} />}
      </Card>

      <Card className="!p-5">
        <StepHeading n={3} title="How we teach" done={vetting.teachingModuleCompleted} />
        <div className="mt-4 space-y-4">
          {TEACHING_MODULE.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold text-dojo-text-primary">{section.title}</h3>
              <ul className="mt-2 list-disc space-y-1 ps-6 text-sm leading-relaxed text-dojo-text-muted">
                {section.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </section>
          ))}
        </div>
        {!vetting.teachingModuleCompleted && (
          <div className="mt-6 space-y-4 border-t border-dojo-border pt-4">
            {TEACHING_MODULE_QUIZ.map((q) => (
              <fieldset key={q.id}>
                <legend className="text-sm text-dojo-text-primary">{q.question}</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {q.options.map((option, i) => (
                    <label key={option} className="flex items-center gap-2 text-sm text-dojo-text-muted">
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === i}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <Button
              variant="primary"
              loading={saving}
              disabled={Object.keys(answers).length < TEACHING_MODULE_QUIZ.length}
              onClick={() => record({ teachingModule: answers })}
            >
              Submit answers
            </Button>
          </div>
        )}
      </Card>

      <Card className="!p-5">
        <StepHeading n={4} title="Trial lesson" done={vetting.trialScores != null} />
        <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
          A recorded 15-minute lesson with a member of staff or a volunteer learner. We score correction
          quality, talk-time balance and how you adapt to the learner&apos;s level. The team will contact you
          to schedule it.
        </p>
        {vetting.trialScores && <Badge variant="success" className="mt-4">Scored</Badge>}
      </Card>

      {vetting.gaps.length === 0 && status !== 'verified' && (
        <p className="text-sm text-dojo-success">Every check has passed. An admin will review your application.</p>
      )}
    </div>
  );
}
