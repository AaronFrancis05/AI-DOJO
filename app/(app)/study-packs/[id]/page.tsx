/* ───────────────────────────────────────────────
   Study pack — one session's homework: the
   explanation, the rules behind the mistakes,
   sentences to fix, dialogues to practise, and
   what to play next.
   Gated behind NEXT_PUBLIC_STUDY_PACKS_ENABLED.
   Consumes /api/study-packs/[id].
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Eye, MessagesSquare, Play, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DialoguePractice } from '@/components/study-packs/DialoguePractice';
import { PersonalizedScenarioCard } from '@/components/study-packs/PersonalizedScenarioCard';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { STUDY_PACKS_ENABLED } from '@/lib/study-packs/config';
import { WEAK_POINT_CATEGORY_LABELS } from '@/lib/study-packs/labels';
import { startScenarioSession } from '@/lib/study-packs/client';
import type { DialoguePayload, DrillPayload, FocusPayload } from '@/lib/study-packs/types';

interface PackDetail {
  id: number;
  sessionId: number | null;
  targetLanguage: string;
  nativeLanguage: string;
  explanation: string;
  status: 'opened' | 'completed';
  scenarioTitle: string | null;
  recommendation: { scenarioId: number; title: string; difficulty: string; reason: string | null } | null;
}

type PackItem =
  | { id: number; kind: 'focus'; payload: FocusPayload }
  | { id: number; kind: 'drill'; payload: DrillPayload }
  | { id: number; kind: 'dialogue'; payload: DialoguePayload };

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">{children}</h2>
  );
}

function DrillCard({ drill, index }: { drill: DrillPayload; index: number }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">Sentence {index + 1}</p>
      <p translate="no" className="mt-2 text-base leading-relaxed text-dojo-text-primary">{drill.incorrect}</p>
      {revealed ? (
        <div className="mt-4 rounded-(--radius-md) border border-dojo-success/30 bg-dojo-success/10 p-4">
          <p translate="no" className="text-base font-semibold leading-relaxed text-dojo-text-primary">{drill.corrected}</p>
          {drill.note && <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">{drill.note}</p>}
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setRevealed(true)}>
          <Eye className="h-4 w-4" /> Show the correction
        </Button>
      )}
    </Card>
  );
}

function DialogueCard({
  dialogue,
  targetLanguage,
}: {
  dialogue: DialoguePayload;
  targetLanguage: string;
}) {
  const [practising, setPractising] = useState(false);
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-dojo-text-primary">{dialogue.title}</h3>
        {practising ? (
          <Button variant="ghost" size="sm" onClick={() => setPractising(false)}>
            <X className="h-4 w-4" /> Close
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setPractising(true)}>
            <Play className="h-4 w-4" /> Practise
          </Button>
        )}
      </div>
      {practising ? (
        <div className="mt-4">
          <DialoguePractice dialogue={dialogue} targetLanguage={targetLanguage} onComplete={() => setPractising(false)} />
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {dialogue.lines.map((line, i) => (
            <li key={i} className={line.speaker === 'learner' ? 'ps-8' : 'pe-8'}>
              <p className="text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
                {line.speaker === 'learner' ? 'You' : 'Partner'}
              </p>
              <p translate="no" className="mt-1 text-base leading-relaxed text-dojo-text-primary">{line.text}</p>
              {line.translation && (
                <p className="text-sm leading-relaxed text-dojo-text-muted">{line.translation}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function StudyPackPage() {
  usePageTitle('Study pack');
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [items, setItems] = useState<PackItem[]>([]);
  const [loading, setLoading] = useState(STUDY_PACKS_ENABLED);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!STUDY_PACKS_ENABLED) return;
    let cancelled = false;
    fetch(`/api/study-packs/${id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.pack) {
          setPack(body.pack);
          setItems(Array.isArray(body.items) ? body.items : []);
        } else {
          setError(body.error ?? 'Could not load this study pack.');
        }
      })
      .catch(() => { if (!cancelled) setError('Could not load this study pack.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const markDone = useCallback(async () => {
    if (!pack || completing) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/study-packs/${pack.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error('save failed');
      setPack({ ...pack, status: 'completed' });
    } catch {
      setError('That did not save. Check your connection and try again.');
    } finally {
      setCompleting(false);
    }
  }, [pack, completing]);

  const startRecommended = useCallback(async () => {
    if (!pack?.recommendation || starting) return;
    setStarting(true);
    try {
      const sessionId = await startScenarioSession(pack.recommendation.scenarioId, {
        targetLanguage: pack.targetLanguage,
        nativeLanguage: pack.nativeLanguage,
      });
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session.');
      setStarting(false);
    }
  }, [pack, starting, router]);

  const focus = items.filter((i): i is Extract<PackItem, { kind: 'focus' }> => i.kind === 'focus');
  const drills = items.filter((i): i is Extract<PackItem, { kind: 'drill' }> => i.kind === 'drill');
  const dialogues = items.filter((i): i is Extract<PackItem, { kind: 'dialogue' }> => i.kind === 'dialogue');

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
  } else if (!pack) {
    body = (
      <Card className="py-12 text-center">
        <p className="text-sm text-dojo-text-muted">{error || 'Study pack not found.'}</p>
      </Card>
    );
  } else {
    body = (
      <div className="flex flex-col gap-8">
        <Card raised>
          <p className="text-base leading-relaxed text-dojo-text-primary">{pack.explanation}</p>
        </Card>

        {focus.length > 0 && (
          <section>
            <SectionHeading>The rules behind your mistakes</SectionHeading>
            <div className="flex flex-col gap-3">
              {focus.map(({ id: itemId, payload }) => (
                <Card key={itemId}>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-base font-semibold text-dojo-text-primary">{payload.title}</h3>
                    <Badge variant="outline">{WEAK_POINT_CATEGORY_LABELS[payload.category] ?? payload.category}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">{payload.rule}</p>
                  {payload.example && (
                    <p translate="no" className="mt-3 text-base leading-relaxed text-dojo-text-primary">{payload.example}</p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {drills.length > 0 && (
          <section>
            <SectionHeading>Fix these sentences</SectionHeading>
            <div className="flex flex-col gap-3">
              {drills.map(({ id: itemId, payload }, i) => <DrillCard key={itemId} drill={payload} index={i} />)}
            </div>
          </section>
        )}

        {dialogues.length > 0 && (
          <section>
            <SectionHeading>
              <MessagesSquare className="me-1 inline h-3 w-3" /> Dialogues to practise
            </SectionHeading>
            <div className="flex flex-col gap-3">
              {dialogues.map(({ id: itemId, payload }) => (
                <DialogueCard key={itemId} dialogue={payload} targetLanguage={pack.targetLanguage} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeading>What to practise next</SectionHeading>
          <div className="flex flex-col gap-3">
            {pack.recommendation && (
              <Card>
                <h3 className="text-base font-semibold text-dojo-text-primary">{pack.recommendation.title}</h3>
                {pack.recommendation.reason && (
                  <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">{pack.recommendation.reason}</p>
                )}
                <Button className="mt-4" loading={starting} disabled={starting} onClick={startRecommended}>
                  <ArrowRight className="h-4 w-4" /> Start this scenario
                </Button>
              </Card>
            )}
            <PersonalizedScenarioCard />
          </div>
        </section>

        {error && <p role="alert" className="text-sm text-dojo-danger">{error}</p>}

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-dojo-text-muted">
            The sentences and rules are also in your <Link href="/review" className="text-dojo-accent hover:underline">review queue</Link>.
          </p>
          {pack.status === 'completed' ? (
            <Badge variant="success"><Check className="me-1 inline h-3 w-3" /> Done</Badge>
          ) : (
            <Button variant="secondary" loading={completing} disabled={completing} onClick={markDone}>
              <Check className="h-4 w-4" /> Mark as done
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
      <div className="max-w-2xl">
        <Link href="/study-packs" className="mb-6 inline-flex items-center gap-1 text-sm text-dojo-text-muted hover:text-dojo-text-primary">
          <ArrowLeft className="h-4 w-4" /> All study packs
        </Link>
        <div className="mb-8">
          <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
            Study pack
          </h1>
          {pack?.scenarioTitle && (
            <p className="mt-2 text-base text-dojo-text-muted leading-relaxed">Homework from “{pack.scenarioTitle}”</p>
          )}
        </div>
        {body}
      </div>
    </div>
  );
}
