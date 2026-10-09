/* ───────────────────────────────────────────────
   Study packs — the homework generated after each
   completed session, the learner's open weak
   points, and a scenario written for them.
   Gated behind NEXT_PUBLIC_STUDY_PACKS_ENABLED.
   Consumes /api/study-packs.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, NotebookPen } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PersonalizedScenarioCard } from '@/components/study-packs/PersonalizedScenarioCard';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUiLocale } from '@/lib/language-context';
import { formatDate } from '@/lib/i18n/format';
import { STUDY_PACKS_ENABLED } from '@/lib/study-packs/config';
import { WEAK_POINT_CATEGORY_LABELS } from '@/lib/study-packs/labels';

interface PackRow {
  id: number;
  sessionId: number | null;
  status: 'ready' | 'opened' | 'completed';
  createdAt: string;
  scenarioTitle: string;
}

interface WeakPointRow {
  id: number;
  category: string;
  pattern: string;
  example: string | null;
  count: number;
}

export default function StudyPacksPage() {
  usePageTitle('Study packs');
  const router = useRouter();
  const { locale } = useUiLocale();
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPointRow[]>([]);
  // Starts false when the feature is off, so the disabled path never has to
  // call setState from inside an effect just to stop a spinner.
  const [loading, setLoading] = useState(STUDY_PACKS_ENABLED);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!STUDY_PACKS_ENABLED) return;
    let cancelled = false;
    fetch('/api/study-packs', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (Array.isArray(body.packs)) {
          setPacks(body.packs);
          setWeakPoints(Array.isArray(body.weakPoints) ? body.weakPoints : []);
        } else {
          setError(body.error ?? 'Could not load your study packs.');
        }
      })
      .catch(() => { if (!cancelled) setError('Could not load your study packs.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  let body: ReactNode;
  if (!STUDY_PACKS_ENABLED) {
    body = (
      <Card className="py-12 text-center">
        <p className="text-sm text-dojo-text-muted">Study packs are not available yet.</p>
      </Card>
    );
  } else if (loading) {
    body = (
      <Card className="animate-pulse">
        <div className="h-4 w-32 rounded bg-dojo-surface-raised" />
        <div className="mt-4 h-4 w-2/3 rounded bg-dojo-surface-raised" />
      </Card>
    );
  } else if (error) {
    body = (
      <Card className="py-12 text-center">
        <p className="text-sm text-dojo-text-muted">{error}</p>
      </Card>
    );
  } else {
    body = (
      <div className="flex flex-col gap-8">
        <PersonalizedScenarioCard />

        {weakPoints.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
              What you&apos;re working on
            </h2>
            <Card>
              <ul className="flex flex-col divide-y divide-dojo-border">
                {weakPoints.map((w) => (
                  <li key={w.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize text-dojo-text-primary">{w.pattern}</p>
                      {w.example && (
                        <p translate="no" className="mt-1 text-sm text-dojo-text-muted">{w.example}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{WEAK_POINT_CATEGORY_LABELS[w.category] ?? w.category}</Badge>
                      <span className="text-xs text-dojo-text-muted">{w.count}×</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">Your packs</h2>
          {packs.length === 0 ? (
            <Card className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-dojo-accent/10">
                <NotebookPen className="h-6 w-6 text-dojo-accent" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-dojo-text-primary">No study packs yet</h3>
              <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
                Finish a session and your homework appears here a minute later.
              </p>
              <Button variant="primary" className="mt-6" onClick={() => router.push('/library')}>
                <ArrowRight className="h-4 w-4" /> Start a session
              </Button>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {packs.map((p) => (
                <Link key={p.id} href={`/study-packs/${p.id}`} className="block">
                  <Card hoverable className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-dojo-text-primary">{p.scenarioTitle}</p>
                      <p className="mt-1 text-xs text-dojo-text-muted">{formatDate(p.createdAt, locale)}</p>
                    </div>
                    {p.status === 'completed' ? (
                      <Badge variant="success"><Check className="me-1 inline h-3 w-3" /> Done</Badge>
                    ) : p.status === 'ready' ? (
                      <Badge variant="accent">New</Badge>
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-dojo-text-muted" />
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
            Study packs
          </h1>
          <p className="mt-2 text-base text-dojo-text-muted leading-relaxed">
            After every session, homework built from your own mistakes: the rules
            behind them, sentences to fix, and dialogues to practise.
          </p>
        </div>
        {body}
      </div>
    </div>
  );
}
