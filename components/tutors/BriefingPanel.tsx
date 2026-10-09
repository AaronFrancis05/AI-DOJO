/* ───────────────────────────────────────────────
   BriefingPanel — what the tutor reads before a 1:1 lesson (PLAN.md 4.1):
   level and syllabus position, what the learner keeps getting wrong, their
   last three AI sessions, homework status and the last lesson's notes.
   Consumes /api/tutor/learners/[id]/briefing?bookingId=.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { WEAK_POINT_CATEGORY_LABELS } from '@/lib/study-packs/labels';
import { SCORE_DIMENSIONS } from '@/lib/roleplay/score-dimensions';
import { CEFR_LABELS, isCefrLevel } from '@/lib/interview/cefr';
import type { Briefing } from '@/lib/tutors/briefing';
import { ClipboardList } from 'lucide-react';

/** The JSON shape: dates arrive as strings. */
type BriefingJson = Omit<Briefing, 'learner'> & { learner: Briefing['learner'] & { cefrAssessedAt: string | null } };

export function BriefingPanel({
  learnerId,
  bookingId,
  onLoaded,
}: {
  learnerId: string;
  bookingId: number;
  /** Lets the page reuse the syllabus unit (for can-do marking) without a second fetch. */
  onLoaded?: (briefing: BriefingJson) => void;
}) {
  const [briefing, setBriefing] = useState<BriefingJson | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tutor/learners/${learnerId}/briefing?bookingId=${bookingId}`, { credentials: 'include' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && body.success) {
          setBriefing(body.briefing);
          onLoaded?.(body.briefing);
        } else if (r.status !== 404) {
          setError(body.error ?? 'Could not load the briefing.');
        }
      })
      .catch(() => { if (!cancelled) setError('Could not load the briefing.'); });
    return () => { cancelled = true; };
    // onLoaded is a notification, not an input: refetching when a parent
    // re-renders with a new closure would be wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerId, bookingId]);

  if (error) return <p className="text-sm text-dojo-danger">{error}</p>;
  if (!briefing) return null;

  const { learner, syllabus } = briefing;
  const level = isCefrLevel(learner.cefrLevel) ? learner.cefrLevel : null;
  const headClass = 'text-xs font-bold uppercase tracking-widest text-dojo-text-muted';

  return (
    <Card className="!p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
        <ClipboardList className="h-4 w-4 shrink-0 text-dojo-accent" />
        Briefing: {learner.name}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-dojo-text-muted">
        <Badge variant={level ? 'accent' : 'outline'}>{level ? `${level} · ${CEFR_LABELS[level]}` : 'No placement yet'}</Badge>
        <span>Speaks {learner.nativeLanguageName}</span>
        <span>· learning {briefing.targetLanguageName}</span>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h3 className={headClass}>Where they are in the syllabus</h3>
          {syllabus ? (
            <div className="mt-2 text-sm leading-relaxed">
              <p className="font-semibold text-dojo-text-primary">{syllabus.level} · {syllabus.unit.title}</p>
              <ul className="mt-1 space-y-1 text-dojo-text-muted">
                {syllabus.unit.canDo.map((c) => (
                  <li key={c.index}>{c.status ? `[${c.status}] ` : ''}{c.text}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-dojo-text-muted">No syllabus for this language yet.</p>
          )}
        </section>

        <section>
          <h3 className={headClass}>What they keep getting wrong</h3>
          {briefing.weakPoints.length === 0 ? (
            <p className="mt-2 text-sm text-dojo-text-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {briefing.weakPoints.map((w) => (
                <li key={w.id} className="text-sm leading-relaxed">
                  <span className="font-semibold text-dojo-text-primary">{w.pattern}</span>
                  <span className="text-dojo-text-muted">
                    {' '}· {WEAK_POINT_CATEGORY_LABELS[w.category as keyof typeof WEAK_POINT_CATEGORY_LABELS] ?? w.category} · seen {w.count}×
                  </span>
                  {w.example && <p translate="no" className="text-dojo-text-muted">“{w.example}”</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className={headClass}>Last AI sessions</h3>
          {briefing.sessions.length === 0 ? (
            <p className="mt-2 text-sm text-dojo-text-muted">No completed sessions yet.</p>
          ) : (
            <ul className="mt-2 space-y-4">
              {briefing.sessions.map((s) => (
                <li key={s.id} className="text-sm leading-relaxed">
                  <p className="font-semibold text-dojo-text-primary">{s.scenarioTitle}</p>
                  {s.scores && (
                    <p className="text-xs tabular-nums text-dojo-text-muted">
                      {SCORE_DIMENSIONS.map((d) => `${d.slice(0, 4)} ${s.scores?.[d]}`).join(' · ')}
                    </p>
                  )}
                  {s.corrections.map((c, i) => (
                    <p key={i} translate="no" className="text-dojo-text-muted">
                      “{c.original}” → “{c.corrected}”
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className={headClass}>Homework and last lesson</h3>
          <p className="mt-2 text-sm text-dojo-text-muted">
            Study packs: {briefing.studyPacks.completed} done, {briefing.studyPacks.opened} opened,{' '}
            {briefing.studyPacks.ready} not opened.
          </p>
          {briefing.lastLesson?.notes && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-dojo-text-primary">
              {briefing.lastLesson.notes}
            </p>
          )}
        </section>
      </div>
    </Card>
  );
}

export type { BriefingJson };
