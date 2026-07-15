'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getDomainBySlug, type DomainFixture } from '@/lib/data/domains';
import { getSituationsByDomain, type SituationFixture } from '@/lib/data/situations';
import { Sprout, ChevronRight, ArrowLeft, MessageSquare } from 'lucide-react';

export default function DomainDetailPage() {
  const { domainSlug } = useParams<{ domainSlug: string }>();
  const [domain, setDomain] = useState<DomainFixture | undefined>();
  const [situations, setSituations] = useState<SituationFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'live' | 'fixture'>('live');

  useEffect(() => {
    async function load() {
      const [dRes, sRes] = await Promise.all([
        getDomainBySlug(domainSlug),
        getSituationsByDomain(domainSlug),
      ]);
      setDomain(dRes.domain);
      setSituations(sRes.data);
      setSource(dRes.source === 'fixture' || sRes.source === 'fixture' ? 'fixture' : 'live');
      setLoading(false);
    }
    load();
  }, [domainSlug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-dojo-surface" />
          <div className="h-48 rounded-xl bg-dojo-surface" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-32 rounded-lg bg-dojo-surface" />
            <div className="h-32 rounded-lg bg-dojo-surface" />
          </div>
        </div>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Domain not found</h1>
        <Link href="/hub" className="text-dojo-accent mt-2 inline-block text-sm underline">
          Back to hub
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/hub"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All Situations
      </Link>

      {source === 'fixture' && (
        <div className="mb-4 rounded-md border border-dojo-warning/30 bg-dojo-warning/5 px-4 py-2 text-xs text-dojo-warning">
          Showing offline data — some options may be out of date
        </div>
      )}

      <div
        className="flex flex-col sm:flex-row items-center gap-6 rounded-[--radius-lg] p-8 text-center sm:text-left"
        style={{
          background: `linear-gradient(135deg, ${domain.heroGradientFrom}, ${domain.heroGradientTo})`,
        }}
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
          <Sprout className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{domain.name}</h1>
          <p className="mt-1 text-sm text-white/70">{domain.description}</p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-dojo-text-primary">Practice Situations</h2>
        <Badge variant="accent">{situations.length} available</Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {situations.map((s) => (
          <Link key={s.id} href={`/dojo/${domainSlug}/${s.id}`}>
            <Card hoverable className="group p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent/10">
                    <MessageSquare className="h-4 w-4 text-dojo-accent" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-dojo-text-primary">{s.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={s.skillLevel}>{s.skillLevel}</Badge>
                      {s.behaviorMode !== 'standard' && (
                        <Badge variant="accent">{s.behaviorMode}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 text-dojo-text-muted transition-transform group-hover:translate-x-0.5" />
              </div>

              <p className="mt-3 text-xs text-dojo-text-muted line-clamp-2">{s.context}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.focusPills.slice(0, 4).map((pill) => (
                  <span
                    key={pill}
                    className="inline-flex items-center gap-1 rounded-full bg-dojo-surface px-2 py-0.5 text-[10px] text-dojo-text-muted"
                  >
                    {pill}
                  </span>
                ))}
                {s.focusPills.length > 4 && (
                  <span className="text-[10px] text-dojo-text-muted">+{s.focusPills.length - 4}</span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
