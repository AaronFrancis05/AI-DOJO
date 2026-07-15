'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getSituationById, type SituationFixture } from '@/lib/data/situations';
import { getDomainBySlug, type DomainFixture } from '@/lib/data/domains';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export default function SituationPickerPage() {
  const { domainSlug, situationId } = useParams<{ domainSlug: string; situationId: string }>();
  const [situation, setSituation] = useState<SituationFixture | undefined>();
  const [domain, setDomain] = useState<DomainFixture | undefined>();
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'live' | 'fixture'>('live');

  useEffect(() => {
    async function load() {
      const [sitRes, domRes] = await Promise.all([
        getSituationById(Number(situationId)),
        getDomainBySlug(domainSlug),
      ]);
      setSituation(sitRes.situation);
      setDomain(domRes.domain);
      setSource(sitRes.source === 'fixture' || domRes.source === 'fixture' ? 'fixture' : 'live');
      setLoading(false);
    }
    load();
  }, [situationId, domainSlug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 rounded bg-dojo-surface" />
          <div className="h-48 rounded-xl bg-dojo-surface" />
          <div className="h-32 rounded-lg bg-dojo-surface" />
        </div>
      </div>
    );
  }

  if (!situation) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Situation not found</h1>
        <Link href={`/dojo/${domainSlug}`} className="text-dojo-accent mt-2 inline-block text-sm underline">
          Back to {domain?.name ?? 'domain'}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link
        href={`/dojo/${domainSlug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-dojo-text-primary">{situation.title}</span>
      </Link>

      {source === 'fixture' && (
        <div className="mb-4 rounded-md border border-dojo-warning/30 bg-dojo-warning/5 px-4 py-2 text-xs text-dojo-warning">
          Showing offline data — some options may be out of date
        </div>
      )}

      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-dojo-text-primary">{situation.title}</h1>
          <Badge variant={situation.skillLevel}>{situation.skillLevel}</Badge>
        </div>
        <p className="mt-2 text-sm text-dojo-text-muted leading-relaxed">{situation.context}</p>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">Learning Goal</h2>
        <p className="text-sm text-dojo-text-primary">{situation.learningGoals}</p>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-dojo-text-muted uppercase tracking-wider">Focus Areas</h2>
        <div className="flex flex-wrap gap-2">
          {situation.focusPills.map((pill, i) => (
            <Badge key={i} variant="accent">{pill}</Badge>
          ))}
        </div>
      </div>

      <Link href={`/dojo/${domainSlug}/${situationId}/character`}>
        <Button variant="primary" size="lg" className="w-full">
          Choose Your Partner
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </Link>
    </div>
  );
}
