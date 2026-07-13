/* ───────────────────────────────────────────────
   Character Selection (Panel 05)
   New route — learner chooses which AI persona plays the counterpart role
   ─────────────────────────────────────────────── */

'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';

import { characters } from '@/lib/data/characters';
import { situations } from '@/lib/data/situations';
import { domains } from '@/lib/data/domains';
import type { SkillLevel } from '@/lib/design-tokens';
import { ArrowLeft, Check, ChevronRight, Smile, UserCheck, Headphones, Star } from 'lucide-react';

const avatarIconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Smile,
  UserCheck,
  Headphones,
  Star,
};

export default function CharacterSelectionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const domainSlug = params.domainSlug as string;
  const situationId = Number(params.situationId);

  const situation = situations.find(s => s.id === situationId);
  const domain = domains.find((d) => d.slug === domainSlug);
  const behaviorMode = searchParams.get('mode') ?? situation?.behaviorMode ?? 'standard';

  const [selectedCharId, setSelectedCharId] = useState<number | null>(
    characters.find((c) => c.defaultForDomain === domainSlug)?.id ?? characters[0]?.id ?? null,
  );

  if (!situation || !domain) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <p className="text-dojo-text-muted">Situation not found</p>
        <Link href={`/dojo/${domainSlug}`}>
          <Button variant="secondary" className="mt-4">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
      </div>
    );
  }

  const selectedChar = characters.find((c) => c.id === selectedCharId);

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-dojo-text-muted">
        <Link href="/hub" className="hover:text-dojo-text-primary transition-colors">
          Hub
        </Link>
        <span>/</span>
        <Link href={`/dojo/${domainSlug}`} className="hover:text-dojo-text-primary transition-colors">
          {domain.name}
        </Link>
        <span>/</span>
        <Link
          href={`/dojo/${domainSlug}/${situationId}`}
          className="hover:text-dojo-text-primary transition-colors"
        >
          {situation.title}
        </Link>
        <span>/</span>
        <span className="text-dojo-text-primary">Character</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Choose Your Practice Partner</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Select an AI character to play the {domain.name} role in &quot;{situation.title}&quot;
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Character Grid — left side */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {characters.map((char) => {
              const Icon = avatarIconMap[char.avatarIcon] ?? Smile;
              const isSelected = selectedCharId === char.id;

              return (
                <Card
                  key={char.id}
                  hoverable
                  raised={isSelected}
                  onClick={() => setSelectedCharId(char.id)}
                  className={`relative cursor-pointer transition-all ${
                    isSelected ? 'ring-2 ring-dojo-accent' : ''
                  }`}
                >
                  {isSelected && (
                    <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-dojo-accent">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-full"
                      style={{ backgroundColor: char.avatarColor + '33' }}
                    >
                      <Icon className="h-7 w-7" style={{ color: char.avatarColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-dojo-text-primary">{char.name}</p>
                      <p className="text-xs text-dojo-text-muted">{char.role}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-dojo-text-muted italic leading-relaxed">
                    &ldquo;{char.personality}&rdquo;
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Character Preview Panel — right side */}
        <div className="lg:col-span-2">
          {selectedChar && (
            <Card raised className="sticky top-6">
              {/* Large avatar */}
              <div className="flex flex-col items-center">
                <div
                  className="flex h-28 w-28 items-center justify-center rounded-full"
                  style={{ backgroundColor: selectedChar.avatarColor + '22' }}
                >
                  {(() => {
                    const Icon = avatarIconMap[selectedChar.avatarIcon] ?? Smile;
                    return <Icon className="h-14 w-14" style={{ color: selectedChar.avatarColor }} />;
                  })()}
                </div>
                <h2 className="mt-4 text-xl font-bold text-dojo-text-primary">
                  {selectedChar.name}
                </h2>
                <p className="text-sm text-dojo-text-muted">{selectedChar.role}</p>
              </div>

              {/* Details */}
              <div className="mt-6 space-y-4 border-t border-dojo-border pt-4">
                <div>
                  <p className="text-xs text-dojo-text-muted uppercase tracking-wider">Personality</p>
                  <p className="text-sm text-dojo-text-primary mt-1">&ldquo;{selectedChar.personality}&rdquo;</p>
                </div>
                <div>
                  <p className="text-xs text-dojo-text-muted uppercase tracking-wider">Voice</p>
                  <p className="text-sm text-dojo-text-primary mt-1">{selectedChar.voiceType}</p>
                </div>
                <div>
                  <p className="text-xs text-dojo-text-muted uppercase tracking-wider">Scenario</p>
                  <p className="text-sm text-dojo-text-primary mt-1">{situation.title}</p>
                  <Badge variant={situation.skillLevel as SkillLevel} className="mt-1">
                    {situation.skillLevel}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-dojo-text-muted uppercase tracking-wider">Mode</p>
                  <p className="text-sm text-dojo-text-primary mt-1 capitalize">{behaviorMode}</p>
                </div>
              </div>

              {/* Start button */}
              <Link
                href={`/session/new?domain=${domainSlug}&situation=${situationId}&character=${selectedChar.id}&mode=${behaviorMode}`}
                className="mt-6 block"
              >
                <Button variant="primary" size="lg" className="w-full">
                  Start Roleplay
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
