'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CharacterPreviewCard } from '@/components/roleplay/avatar-variants/CharacterPreviewCard';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { getSituationById, type SituationFixture } from '@/lib/data/situations';
import { getDomainBySlug, type DomainFixture } from '@/lib/data/domains';
import { getCharacters, type CharacterFixture } from '@/lib/data/characters';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CharacterSelectionPage() {
  const { domainSlug, situationId } = useParams<{ domainSlug: string; situationId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [situation, setSituation] = useState<SituationFixture | undefined>();
  const [domain, setDomain] = useState<DomainFixture | undefined>();
  const [characters, setCharacters] = useState<CharacterFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'live' | 'fixture'>('live');

  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');

  const behaviorMode = searchParams.get('mode') ?? 'standard';

  const situationIdNum = Number(situationId);

  useEffect(() => {
    async function load() {
      const [sitRes, domRes, charsRes, statsRes] = await Promise.all([
        getSituationById(situationIdNum),
        getDomainBySlug(domainSlug),
        getCharacters(),
        fetch('/api/user/stats').then(r => r.json()).catch(() => ({})),
      ]);
      setSituation(sitRes.situation);
      setDomain(domRes.domain);
      setSource(charsRes.source);

      if (statsRes.success && statsRes.stats) {
        if (statsRes.stats.preferredTargetLanguage) setTargetLanguage(statsRes.stats.preferredTargetLanguage);
        if (statsRes.stats.nativeLanguage) setNativeLanguage(statsRes.stats.nativeLanguage);
      }

      const targetParam = searchParams.get('targetLang');
      const nativeParam = searchParams.get('nativeLang');
      if (targetParam) setTargetLanguage(targetParam);
      if (nativeParam) setNativeLanguage(nativeParam);

      const chars = charsRes.data;
      const dom = domRes.domain;

      const matching = dom
        ? chars.filter(c => c.defaultForDomain === dom.slug)
        : [];
      setCharacters(matching.length > 0 ? matching : chars);
      setLoading(false);
    }
    load();
  }, [situationIdNum, domainSlug, searchParams]);

  const startSession = useCallback(async (characterId: number, avatarModelUrl?: string | null) => {
    if (avatarModelUrl) {
      import('@react-three/drei').then(m => m.useGLTF.preload(avatarModelUrl));
    }

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        situationId: situationIdNum,
        characterId,
        behaviorMode,
        targetLanguage,
        nativeLanguage,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? 'Failed to start session — try again.');
      return;
    }
    const body = await res.json();
    router.push(`/session/${body.session.id}`);
  }, [situationIdNum, behaviorMode, targetLanguage, nativeLanguage, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-dojo-surface" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="h-44 rounded-lg bg-dojo-surface" />
            <div className="h-44 rounded-lg bg-dojo-surface" />
            <div className="h-44 rounded-lg bg-dojo-surface" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href={`/dojo/${domainSlug}/${situationId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-dojo-text-primary">Character</span>
      </Link>

      {source === 'fixture' && (
        <div className="mb-4 rounded-md border border-dojo-warning/30 bg-dojo-warning/5 px-4 py-2 text-xs text-dojo-warning">
          Showing offline data — some options may be out of date
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Choose Your Practice Partner</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          {situation?.counterpartRole
            ? `You'll be practicing with a ${situation.counterpartRole}`
            : 'Select a character to practice with'}
        </p>
      </div>

      <div className="mb-6 rounded-[--radius-lg] border border-dojo-border bg-dojo-surface p-4">
        <LanguagePicker
          targetLanguage={targetLanguage}
          nativeLanguage={nativeLanguage}
          onTargetChange={setTargetLanguage}
          onNativeChange={setNativeLanguage}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((char) => (
          <Card key={char.id} hoverable className="group p-5">
            <div className="flex flex-col items-center text-center">
              <div className="h-40 w-full">
                <CharacterPreviewCard
                  name={char.name}
                  role={char.role}
                  accentColor={char.avatarColor}
                  modelUrl={char.avatarModelUrl ?? undefined}
                  domainSlug={domainSlug}
                />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-dojo-text-primary">{char.name}</h3>
              <p className="text-xs text-dojo-text-muted">{char.role}</p>
              <p className="mt-2 text-[11px] text-dojo-text-muted leading-relaxed line-clamp-2">{char.personality}</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4 w-full"
                onClick={() => startSession(char.id, char.avatarModelUrl)}
              >
                Start Practice
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
