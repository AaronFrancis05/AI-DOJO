'use client';

/* ───────────────────────────────────────────────
   PersonalizedScenarioCard — "write a scenario
   for me": an optional topic, then a learner-owned
   scenario built from their profile and weak
   points, and straight into a session on it.
   ─────────────────────────────────────────────── */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { createPersonalizedScenario, startScenarioSession } from '@/lib/study-packs/client';
import { MAX_TOPIC_LENGTH } from '@/lib/study-packs/personalized-scenario';

export function PersonalizedScenarioCard() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const scenarioId = await createPersonalizedScenario(topic);
      const sessionId = await startScenarioSession(scenarioId);
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write a scenario right now.');
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-accent/10">
          <Sparkles className="h-5 w-5 text-dojo-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-dojo-text-primary">A scenario written for you</h3>
          <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">
            A conversation about your own work and interests that makes you use what you keep getting wrong.
            Name a situation, or leave it blank and we&apos;ll choose.
          </p>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => { e.preventDefault(); void create(); }}
          >
            <input
              type="text"
              value={topic}
              maxLength={MAX_TOPIC_LENGTH}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. explaining a delay to my manager"
              aria-label="What do you want to practise?"
              disabled={busy}
              className="flex-1 rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary outline-none transition-colors placeholder:text-dojo-text-muted focus:border-dojo-accent"
            />
            <Button type="submit" loading={busy} disabled={busy}>
              {busy ? 'Writing…' : 'Write it'}
            </Button>
          </form>
          {error && <p role="alert" className="mt-2 text-sm text-dojo-danger">{error}</p>}
        </div>
      </div>
    </Card>
  );
}
