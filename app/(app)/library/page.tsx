/* ───────────────────────────────────────────────
   Library (Panel 02) — Domain Grid
   Shows all domains as clickable cards
   ─────────────────────────────────────────────── */

'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { getDomains } from '@/lib/data/domains';
import { cn } from '@/lib/design-tokens';
import Link from 'next/link';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import {
  UtensilsCrossed,
  Building2,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
  UserRound,
  GraduationCap,
  ArrowRight,
  Plus,
} from 'lucide-react';
import type { DomainFixture } from '@/lib/data/domains';
import { CreateDomainDialog } from '@/components/CreateDomainDialog';
import { useUser } from '@/lib/auth/user-context';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  UtensilsCrossed,
  Building2,
  Plane,
  HeartPulse,
  ShoppingBag,
  Briefcase,
  Compass,
  Sun,
  UserRound,
  GraduationCap,
};

export default function LibraryPage() {
  usePageTitle('Library');
  const [domains, setDomains] = useState<DomainFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  // A custom scenario writes into the *shared* library, so the endpoint
  // behind this card is admin-only. Hiding it is only to avoid offering a
  // button that 404s — `POST /api/domains/create-custom` is the real gate.
  const canCreate = useUser()?.role === 'admin';

  useEffect(() => {
    getDomains().then(({ data }) => {
      setDomains(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">Library</h1>
        <p className="mt-2 text-base text-dojo-text-muted leading-relaxed">
          Pick a real-world setting and start a conversation with an AI
          character — restaurants, travel, work, and daily life.
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
            const unpublished = domain.isActive === false;
            return (
              <Link
                key={domain.id}
                href={`/dojo/${domain.slug}`}
                className={cn('block', unpublished && 'opacity-40')}
              >
                <Card hoverable className="group h-full !p-0 overflow-hidden border-dojo-border hover:border-dojo-accent transition-all duration-300 shadow-lg hover:shadow-dojo-accent/10">
                  <div
                    className="relative flex h-36 items-center justify-center overflow-hidden"
                  >
                    {domain.imageUrl && (
                      <Image
                        src={domain.imageUrl}
                        alt=""
                        fill
                        unoptimized
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover opacity-50 transition-transform duration-700 group-hover:scale-110 group-hover:opacity-60"
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-dojo-text-primary">{domain.name}</h3>
                        {unpublished && <Badge variant="outline">archived</Badge>}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-dojo-text-muted transition-transform group-hover:translate-x-0.5" />
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

          {/* ── Create Custom Card ── */}
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="block text-start w-full">
              <Card className="group h-full !p-0 overflow-hidden border-2 border-dashed border-dojo-border hover:border-dojo-accent transition-all duration-300 cursor-pointer bg-dojo-surface/50 hover:bg-dojo-surface">
                <div className="flex h-full min-h-[17rem] flex-col items-center justify-center gap-3 p-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-dojo-text-muted/40 transition-colors duration-300 group-hover:border-dojo-accent group-hover:bg-dojo-accent/10">
                    <Plus className="h-8 w-8 text-dojo-text-muted/50 group-hover:text-dojo-accent transition-colors duration-300" />
                  </div>
                  <h3 className="text-base font-semibold text-dojo-text-muted group-hover:text-dojo-text-primary transition-colors duration-300">
                    Create Custom
                  </h3>
                  <p className="text-xs text-dojo-text-muted/60 text-center leading-relaxed">
                    Adds a domain to the shared Library
                  </p>
                </div>
              </Card>
            </button>
          )}
        </div>
      )}

      {canCreate && <CreateDomainDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}
