/* ───────────────────────────────────────────────
   Hub (Panel 02) — Domain Grid
   Shows all domains as clickable cards
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { getDomains } from '@/lib/data/domains';
import Link from 'next/link';
import {
  UtensilsCrossed,
  Building2,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
  ArrowRight,
} from 'lucide-react';
import type { DomainFixture } from '@/lib/data/domains';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  UtensilsCrossed,
  Building2,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
};

export default function HubPage() {
  const [domains, setDomains] = useState<DomainFixture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDomains().then(({ data }) => {
      setDomains(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Choose a Scenario</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Select a real-world setting for your roleplay practice
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="!p-0 animate-pulse">
              <div className="h-28 rounded-t-[--radius-md] bg-dojo-border" />
              <div className="p-4 space-y-2">
                <div className="h-5 w-28 rounded bg-dojo-border" />
                <div className="h-3 w-full rounded bg-dojo-border" />
                <div className="h-3 w-20 rounded bg-dojo-border" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {domains.map((domain) => {
            const Icon = iconMap[domain.icon] ?? Compass;
            return (
              <Link key={domain.id} href={`/dojo/${domain.slug}`} className="block">
                <Card hoverable className="group h-full !p-0 overflow-hidden border-dojo-border hover:border-dojo-accent transition-all duration-300 shadow-lg hover:shadow-dojo-accent/10">
                  <div
                    className="relative flex h-36 items-center justify-center overflow-hidden"
                  >
                    {domain.imageUrl && (
                      <img
                        src={domain.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover opacity-50 transition-transform duration-700 group-hover:scale-110 group-hover:opacity-60"
                      />
                    )}
                    <div 
                      className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-80"
                      style={{
                        background: `linear-gradient(135deg, ${domain.heroGradientFrom}dd, ${domain.heroGradientTo}ee)`,
                      }}
                    />
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl transition-transform duration-300 group-hover:scale-110">
                        <Icon className="h-10 w-10 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-dojo-text-primary">{domain.name}</h3>
                      <ArrowRight className="h-4 w-4 text-dojo-text-muted transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-1 text-xs text-dojo-text-muted leading-relaxed">
                      {domain.description}
                    </p>
                    <p className="mt-3 text-xs text-dojo-text-muted">
                      {domain.situationCount} situations
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
