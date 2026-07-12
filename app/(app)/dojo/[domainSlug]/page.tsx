/* ───────────────────────────────────────────────
   Domain Detail (Panel 03) — Domain hero + situations list
   ─────────────────────────────────────────────── */

'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { domains } from '@/lib/mock-data/domains';
import { getSituationsByDomain } from '@/lib/mock-data/situations';
import { skillLevelBadgeClass, type SkillLevel } from '@/lib/design-tokens';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import {
  UtensilsCrossed,
  Building2,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  UtensilsCrossed,
  Building2,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
};

export default function DomainDetailPage() {
  const params = useParams();
  const domainSlug = params.domainSlug as string;

  const domain = domains.find((d) => d.slug === domainSlug);
  const situations = getSituationsByDomain(domainSlug);

  if (!domain) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <p className="text-dojo-text-muted">Domain not found</p>
        <Link href="/hub">
          <Button variant="secondary" className="mt-4">
            <ArrowLeft className="h-4 w-4" /> Back to Hub
          </Button>
        </Link>
      </div>
    );
  }

  const Icon = iconMap[domain.icon] ?? Compass;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Back link */}
      <Link
        href="/hub"
        className="mb-6 inline-flex items-center gap-1 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All Domains
      </Link>

      {/* Domain hero */}
      <div
        className="flex items-center gap-6 rounded-[--radius-lg] p-8"
        style={{
          background: `linear-gradient(135deg, ${domain.heroGradientFrom}22, ${domain.heroGradientTo}44)`,
          border: `1px solid ${domain.heroGradientFrom}44`,
        }}
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ background: domain.heroGradientFrom }}
        >
          <Icon className="h-10 w-10 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dojo-text-primary">{domain.name}</h1>
          <p className="mt-1 text-sm text-dojo-text-muted">{domain.description}</p>
          <p className="mt-2 text-xs text-dojo-text-muted">{situations.length} situations available</p>
        </div>
      </div>

      {/* Situation list */}
      <h2 className="mt-8 mb-4 text-lg font-semibold text-dojo-text-primary">Situations</h2>
      <div className="space-y-3">
        {situations.map((situation) => (
          <Link
            key={situation.id}
            href={`/dojo/${domainSlug}/${situation.id}`}  // use situation id as slug
            className="block"
          >
            <Card hoverable>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-dojo-text-primary">
                      {situation.title}
                    </h3>
                    <Badge variant={situation.skillLevel as SkillLevel}>
                      {situation.skillLevel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-dojo-text-muted line-clamp-2">
                    {situation.context}
                  </p>
                </div>
                <ChevronRight className="ml-4 h-5 w-5 shrink-0 text-dojo-text-muted" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
