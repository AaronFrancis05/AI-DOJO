/* ───────────────────────────────────────────────
   Situation Picker (Panel 04)
   Practice-focus pills + Standard/Trouble toggle
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { BehaviorModeToggle } from '@/components/ui/BehaviorModeToggle';
import { getSituationById, type SituationFixture } from '@/lib/data/situations';
import { getDomainBySlug, type DomainFixture } from '@/lib/data/domains';
import type { SkillLevel, BehaviorMode } from '@/lib/design-tokens';
import { ArrowLeft, Target, ChevronRight } from 'lucide-react';

export default function SituationPickerPage() {
  const params = useParams();
  const domainSlug = params.domainSlug as string;
  const situationId = Number(params.situationId);

  const [situation, setSituation] = useState<SituationFixture | undefined>();
  const [domain, setDomain] = useState<DomainFixture | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [sit, dom] = await Promise.all([
        getSituationById(situationId),
        getDomainBySlug(domainSlug),
      ]);
      setSituation(sit);
      setDomain(dom);
      setLoading(false);
    }
    load();
  }, [situationId, domainSlug]);

  const [behaviorMode, setBehaviorMode] = useState<BehaviorMode>('standard');
  const [selectedPills, setSelectedPills] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (situation) {
      setBehaviorMode(situation.behaviorMode as BehaviorMode);
    }
  }, [situation]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-32 rounded bg-dojo-border" />
          <div className="h-8 w-64 rounded bg-dojo-border" />
          <div className="h-4 w-full rounded bg-dojo-border" />
          <div className="h-24 rounded-[--radius-md] bg-dojo-border" />
          <div className="h-24 rounded-[--radius-md] bg-dojo-border" />
        </div>
      </div>
    );
  }

  if (!situation || !domain) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <p className="text-dojo-text-muted">Situation not found</p>
        <Link href={`/dojo/${domainSlug}`}>
          <Button variant="secondary" className="mt-4">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
      </div>
    );
  }

  const togglePill = (pill: string) => {
    const next = new Set(selectedPills);
    if (next.has(pill)) next.delete(pill);
    else next.add(pill);
    setSelectedPills(next);
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-2 text-sm text-dojo-text-muted">
        <Link href="/hub" className="hover:text-dojo-text-primary transition-colors">
          Hub
        </Link>
        <span>/</span>
        <Link href={`/dojo/${domainSlug}`} className="hover:text-dojo-text-primary transition-colors">
          {domain.name}
        </Link>
        <span>/</span>
        <span className="text-dojo-text-primary">{situation.title}</span>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dojo-text-primary">{situation.title}</h1>
          <Badge variant={situation.skillLevel as SkillLevel}>{situation.skillLevel}</Badge>
        </div>
        <p className="mt-2 text-sm text-dojo-text-muted leading-relaxed">{situation.context}</p>
      </div>

      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-dojo-accent" />
          <h3 className="text-sm font-semibold text-dojo-text-primary">Practice Focus</h3>
          <span className="text-xs text-dojo-text-muted">
            ({selectedPills.size}/{situation.focusPills.length} selected)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {situation.focusPills.map((pill) => (
            <Pill
              key={pill}
              variant="default"
              active={selectedPills.has(pill)}
              onClick={() => togglePill(pill)}
            >
              {pill}
            </Pill>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-dojo-text-primary">Skill Level</h3>
            <p className="text-xs text-dojo-text-muted mt-0.5">
              {situation.skillLevel === 'beginner'
                ? 'Basic phrases and simple vocabulary'
                : situation.skillLevel === 'intermediate'
                ? 'Full sentences and moderate complexity'
                : 'Complex structures and keigo'}
            </p>
          </div>
          <Badge variant={situation.skillLevel as SkillLevel}>
            {situation.skillLevel}
          </Badge>
        </div>

        <div className="mt-5 border-t border-dojo-border pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-dojo-text-primary">Behavior Mode</h3>
              <p className="text-xs text-dojo-text-muted mt-0.5">
                {behaviorMode === 'standard'
                  ? 'Normal interaction — the character responds cooperatively'
                  : 'Challenging interaction — the character creates obstacles'}
              </p>
            </div>
            <BehaviorModeToggle value={behaviorMode} onChange={setBehaviorMode} />
          </div>
        </div>
      </Card>

      <Card className="mb-8">
        <h3 className="text-sm font-semibold text-dojo-text-primary mb-2">Learning Goals</h3>
        <p className="text-sm text-dojo-text-muted">{situation.learningGoals}</p>
      </Card>

      <div className="flex justify-end">
        <Link
          href={`/dojo/${domainSlug}/${situationId}/character?mode=${behaviorMode}&focus=${Array.from(selectedPills).join(',')}`}
        >
          <Button variant="primary" size="lg">
            Choose Character
            <ChevronRight className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
