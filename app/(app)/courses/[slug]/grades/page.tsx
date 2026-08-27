/* ───────────────────────────────────────────────
   Grades — the AI's verdict on each lesson, and the human tutor verdicts,
   side by side. That comparison is what `tutor_evaluations.agreesWithAi`
   exists for; this page is where a learner actually sees it.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { SCORE_DIMENSIONS } from '@/lib/ai-engine';
import { ArrowLeft, Bot, GraduationCap } from 'lucide-react';

const DIMENSION_LABELS: Record<string, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  fluency: 'Fluency',
  cultural: 'Cultural fit',
  task: 'Task completion',
  expressionAppropriateness: 'Expression',
};

const AGREEMENT_LABEL: Record<string, string> = {
  agrees: 'Agreed with the AI',
  too_generous: 'Said the AI was too generous',
  too_harsh: 'Said the AI was too harsh',
};

type Scores = Record<string, number | null>;

interface AiGrade {
  sessionId: number;
  lessonId: number | null;
  lessonTitle: string;
  unitTitle: string | null;
  scores: Scores;
  composite: number;
  feedback: string | null;
  createdAt: string;
}

interface TutorGrade {
  id: number;
  tutorName: string;
  source: 'assessment' | 'booking';
  title: string;
  occurredAt: string;
  scores: Scores;
  composite: number;
  agreesWithAi: string | null;
  notes: string | null;
  createdAt: string;
  /** Set when the verdict came from an assessment room — the pairing key below. */
  queueSlotId: number | null;
}

/** An examination sat with the AI examiner, in a tutor's absence. */
interface InterviewGrade {
  id: number;
  title: string;
  queueSlotId: number;
  occurredAt: string;
  learnerTurns: number;
  scores: Scores;
  composite: number;
  feedback: string | null;
}

/**
 * One dimension, with the AI's bar in accent and the tutor's in success.
 *
 * Either side may be absent — a lesson nobody has reviewed, or a standalone
 * tutor verdict with no AI session behind it — so a missing score draws no
 * bar rather than a zero-length one, which would read as a score of 0.
 */
function ScoreRow({ label, ai, tutor }: { label: string; ai: number | null; tutor: number | null }) {
  return (
    <div className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-3 text-sm">
      <span className="truncate text-dojo-text-muted">{label}</span>
      <span className="flex flex-col gap-1">
        {ai != null && <ProgressBar value={ai} color="accent" size="sm" />}
        {tutor != null && <ProgressBar value={tutor} color="success" size="sm" />}
      </span>
      <span className="text-right font-semibold tabular-nums text-dojo-text-primary">
        {ai != null && tutor != null ? `${ai}/${tutor}` : (ai ?? tutor ?? '—')}
      </span>
    </div>
  );
}

export default function GradesPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const user = useUser();
  const slug = params.slug;
  const targetLanguage = searchParams.get('target') || user?.preferredTargetLanguage || '';

  const [aiGrades, setAiGrades] = useState<AiGrade[]>([]);
  const [tutorGrades, setTutorGrades] = useState<TutorGrade[]>([]);
  const [interviewGrades, setInterviewGrades] = useState<InterviewGrade[]>([]);
  const [courseTitle, setCourseTitle] = useState('');
  const [loading, setLoading] = useState(true);

  usePageTitle(courseTitle ? `${courseTitle} — grades` : 'Grades');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const query = targetLanguage ? `?target=${encodeURIComponent(targetLanguage)}` : '';
        const res = await fetch(`/api/courses/${slug}/grades${query}`, { credentials: 'include' });
        const data = await res.json();
        if (cancelled || !data.success) return;
        setCourseTitle(data.course?.title ?? '');
        setAiGrades(data.aiGrades as AiGrade[]);
        setTutorGrades(data.tutorGrades as TutorGrade[]);
        setInterviewGrades((data.interviewGrades ?? []) as InterviewGrade[]);
      } catch {
        /* leave the empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug, targetLanguage]);

  /**
   * The most recent tutor verdict tied to the same AI session, when there is
   * one. That pairing is the only place the two scales are directly about the
   * same performance; everything else is shown alongside, not against.
   */
  const tutorBySession = useMemo(() => {
    const map = new Map<number, TutorGrade>();
    for (const t of tutorGrades) {
      const sessionId = (t as TutorGrade & { sessionId?: number | null }).sessionId;
      if (sessionId != null && !map.has(sessionId)) map.set(sessionId, t);
    }
    return map;
  }, [tutorGrades]);

  /**
   * The tutor's own verdict on the same examination the AI examiner marked.
   *
   * Both anchors are unique per queue slot, so this is a genuine 1:1 pairing —
   * and the only place on this page where a human and a machine have marked
   * one identical performance rather than two related ones.
   */
  const tutorBySlot = useMemo(() => {
    const map = new Map<number, TutorGrade>();
    for (const t of tutorGrades) {
      if (t.queueSlotId != null && !map.has(t.queueSlotId)) map.set(t.queueSlotId, t);
    }
    return map;
  }, [tutorGrades]);

  const averageAi = useMemo(
    () =>
      aiGrades.length === 0
        ? null
        : Math.round(aiGrades.reduce((sum, g) => sum + g.composite, 0) / aiGrades.length),
    [aiGrades],
  );

  const averageTutor = useMemo(
    () =>
      tutorGrades.length === 0
        ? null
        : Math.round(tutorGrades.reduce((sum, g) => sum + g.composite, 0) / tutorGrades.length),
    [tutorGrades],
  );

  return (
    <div className="mx-auto w-full max-w-4xl p-6 lg:p-10">
      <Link
        href={`/courses/${slug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the course
      </Link>

      <h1 className="text-2xl font-bold leading-none tracking-tight text-dojo-text-primary">
        Grades
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
        The AI grades every lesson you finish. A tutor grades you on the same six dimensions, so
        the two verdicts can be read against each other.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Card className="!p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            <Bot className="h-3.5 w-3.5" /> AI average
          </p>
          <p className="mt-2 text-2xl font-bold leading-none text-dojo-text-primary">
            {averageAi ?? '—'}
          </p>
        </Card>
        <Card className="!p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            <GraduationCap className="h-3.5 w-3.5" /> Tutor average
          </p>
          <p className="mt-2 text-2xl font-bold leading-none text-dojo-text-primary">
            {averageTutor ?? '—'}
          </p>
        </Card>
      </div>

      {loading ? (
        <div className="mt-8 space-y-3">
          {[0, 1].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-28 rounded bg-dojo-surface-raised" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
              Lessons graded by the AI
            </h2>
            {aiGrades.length === 0 ? (
              <Card className="border-dashed py-10 text-center">
                <p className="text-sm text-dojo-text-muted">
                  Finish a lesson and its scorecard appears here.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {aiGrades.map((g) => {
                  const tutor = tutorBySession.get(g.sessionId) ?? null;
                  return (
                    <Card key={g.sessionId} className="!p-5">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-dojo-text-primary">
                            {g.lessonTitle}
                          </p>
                          {g.unitTitle && (
                            <p className="text-xs text-dojo-text-muted">{g.unitTitle}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="accent">AI {g.composite}</Badge>
                          {tutor && <Badge variant="success">Tutor {tutor.composite}</Badge>}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {SCORE_DIMENSIONS.map((d) => (
                          <ScoreRow
                            key={d}
                            label={DIMENSION_LABELS[d] ?? d}
                            ai={g.scores[d] ?? null}
                            tutor={tutor ? tutor.scores[d] ?? null : null}
                          />
                        ))}
                      </div>

                      {tutor?.notes && (
                        <p className="mt-4 border-t border-dojo-border pt-4 text-sm leading-relaxed text-dojo-text-primary">
                          <span className="font-medium">{tutor.tutorName}:</span> {tutor.notes}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {interviewGrades.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
                Examinations with the AI examiner
              </h2>
              <div className="space-y-3">
                {interviewGrades.map((g) => {
                  const tutor = tutorBySlot.get(g.queueSlotId) ?? null;
                  return (
                    <Card key={g.id} className="!p-5">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-dojo-text-primary">
                            {g.title}
                          </p>
                          <p className="text-xs text-dojo-text-muted">
                            Spoken interview · {new Date(g.occurredAt).toLocaleDateString()} ·{' '}
                            {g.learnerTurns} {g.learnerTurns === 1 ? 'answer' : 'answers'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="accent">AI {g.composite}</Badge>
                          {tutor && <Badge variant="success">Tutor {tutor.composite}</Badge>}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {SCORE_DIMENSIONS.map((d) => (
                          <ScoreRow
                            key={d}
                            label={DIMENSION_LABELS[d] ?? d}
                            ai={g.scores[d] ?? null}
                            tutor={tutor ? tutor.scores[d] ?? null : null}
                          />
                        ))}
                      </div>

                      {g.feedback && (
                        <p className="mt-4 border-t border-dojo-border pt-4 text-sm leading-relaxed text-dojo-text-primary">
                          {g.feedback}
                        </p>
                      )}

                      {tutor?.notes && (
                        <p className="mt-3 text-sm leading-relaxed text-dojo-text-primary">
                          <span className="font-medium">{tutor.tutorName}:</span> {tutor.notes}
                        </p>
                      )}
                      {tutor?.agreesWithAi && (
                        <p className="mt-2 text-xs text-dojo-text-muted">
                          {AGREEMENT_LABEL[tutor.agreesWithAi] ?? tutor.agreesWithAi}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-10">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
              Verdicts from tutors
            </h2>
            {tutorGrades.length === 0 ? (
              <Card className="border-dashed py-10 text-center">
                <p className="text-sm text-dojo-text-muted">
                  No tutor has graded you yet. Book an evaluation session or join an assessment.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {tutorGrades.map((t) => (
                  <Card key={t.id} className="!p-5">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-dojo-text-primary">
                          {t.title}
                        </p>
                        <p className="text-xs text-dojo-text-muted">
                          {t.tutorName} · {new Date(t.occurredAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="capitalize">{t.source}</Badge>
                        <Badge variant="success">{t.composite}</Badge>
                      </div>
                    </div>

                    {t.agreesWithAi && (
                      <p className="mb-3 text-xs text-dojo-text-muted">
                        {AGREEMENT_LABEL[t.agreesWithAi] ?? t.agreesWithAi}
                      </p>
                    )}

                    <div className="space-y-2">
                      {SCORE_DIMENSIONS.map((d) => (
                        <ScoreRow
                          key={d}
                          label={DIMENSION_LABELS[d] ?? d}
                          ai={null}
                          tutor={t.scores[d] ?? null}
                        />
                      ))}
                    </div>

                    {t.notes && (
                      <p className="mt-4 border-t border-dojo-border pt-4 text-sm leading-relaxed text-dojo-text-primary">
                        {t.notes}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
