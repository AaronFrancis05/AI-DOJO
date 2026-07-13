'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  UtensilsCrossed,
  Building2,
  Plane,
  Stethoscope,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import type { DomainFixture } from '@/lib/data/domains';
import { getDomains } from '@/lib/data/domains';

const iconMap: Record<string, LucideIcon> = {
  UtensilsCrossed, Building2, Plane, Stethoscope, ShoppingBag, Briefcase, Compass, Sun,
};

export default function HubPage() {
  const [domains, setDomains] = useState<DomainFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'live' | 'fixture'>('live');

  useEffect(() => {
    getDomains().then(({ data, source: s }) => {
      setDomains(data);
      setSource(s);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Choose Your Domain</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Select a practice domain to get started
        </p>
      </div>

      {source === 'fixture' && (
        <div className="mb-4 rounded-md border border-dojo-warning/30 bg-dojo-warning/5 px-4 py-2 text-xs text-dojo-warning">
          Showing offline data — some options may be out of date
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse"><div /></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {domains.map((domain) => {
            const Icon = iconMap[domain.icon];
            return (
              <Link key={domain.slug} href={`/dojo/${domain.slug}`}>
                <div
                  className="rounded-[--radius-md] overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${domain.heroGradientFrom}, ${domain.heroGradientTo})`,
                  }}
                >
                <Card
                  hoverable
                  className="group relative flex h-40 flex-col justify-between overflow-hidden !bg-transparent !border-transparent"
                >
                  <div className="flex items-start justify-between p-5">
                    <div className="rounded-xl bg-white/15 p-2.5 backdrop-blur-sm">
                      {Icon && <Icon className="h-6 w-6 text-white" />}
                    </div>
                    <Badge variant="accent">{domain.situationCount} scenes</Badge>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-white">{domain.name}</h3>
                    <p className="mt-0.5 text-xs text-white/70">{domain.description}</p>
                  </div>
                </Card>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
