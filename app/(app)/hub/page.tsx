/* ───────────────────────────────────────────────
   Hub (Panel 02) — Domain Grid
   Shows all 8 domains as clickable cards
   ─────────────────────────────────────────────── */

'use client';

import { Card } from '@/components/ui/Card';
import { domains } from '@/lib/data/domains';
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
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Choose a Domain</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Select a real-world setting for your roleplay practice
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {domains.map((domain) => {
          const Icon = iconMap[domain.icon] ?? Compass;
          return (
            <Link key={domain.id} href={`/dojo/${domain.slug}`} className="block">
              <Card hoverable className="group h-full !p-0">
                {/* Gradient hero area */}
                <div
                  className="flex h-28 items-center justify-center rounded-t-[--radius-md]"
                  style={{
                    background: `linear-gradient(135deg, ${domain.heroGradientFrom}, ${domain.heroGradientTo})`,
                  }}
                >
                  <Icon className="h-12 w-12 text-white/80" />
                </div>
                {/* Content */}
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
    </div>
  );
}
