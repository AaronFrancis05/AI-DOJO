/* ───────────────────────────────────────────────
   CharacterSelectDialog — choose practice partner + languages
   as a dialogue section over the situation detail page
   (was /dojo/[domainSlug]/[situationId]/character route).
   ─────────────────────────────────────────────── */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { CharacterPreviewCard } from '@/components/roleplay/avatar-variants/CharacterPreviewCard';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { getSituationById, type SituationFixture } from '@/lib/data/situations';
import { getDomainBySlug } from '@/lib/data/domains';
import { getCharacters, type CharacterFixture } from '@/lib/data/characters';
import { ChevronRight } from 'lucide-react';

interface CharacterSelectDialogProps {
  open: boolean;
  onClose: () => void;
  domainSlug: string;
  situationId: string;
  behaviorMode: string;
}

export function CharacterSelectDialog({
  open,
  onClose,
  domainSlug,
  situationId,
  behaviorMode,
}: CharacterSelectDialogProps) {
  const router = useRouter();
  const [situation, setSituation] = useState<SituationFixture | undefined>();
  const [characters, setCharacters] = useState<CharacterFixture[]>([]);
  const [charsLoaded, setCharsLoaded] = useState(false);
  const [source, setSource] = useState<'live' | 'fixture'>('live');
  const loading = open && !charsLoaded;

  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');

  const situationIdNum = Number(situationId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      const [sitRes, domRes, charsRes, statsRes] = await Promise.all([
        getSituationById(situationIdNum),
        getDomainBySlug(domainSlug),
        getCharacters(),
        fetch('/api/user/stats', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      ]);
      if (cancelled) return;
      setSituation(sitRes.situation);
      setSource(charsRes.source);

      if (statsRes.success && statsRes.stats) {
        if (statsRes.stats.preferredTargetLanguage) setTargetLanguage(statsRes.stats.preferredTargetLanguage);
        if (statsRes.stats.nativeLanguage) setNativeLanguage(statsRes.stats.nativeLanguage);
      }

      const chars = charsRes.data;
      const dom = domRes.domain;

      const matching = dom
        ? chars.filter(c => c.defaultForDomain === dom.slug)
        : [];
      setCharacters(matching.length > 0 ? matching : chars);
      setCharsLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [open, situationIdNum, domainSlug]);

  const startSession = useCallback(async (characterId: number, avatarModelUrl?: string | null) => {
    if (avatarModelUrl) {
      import('@react-three/drei').then(m => m.useGLTF.preload(avatarModelUrl));
    }

    const res = await fetch('/api/sessions', {
      method: 'POST',
      credentials: 'include',
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Choose Your Practice Partner"
      subtitle={
        situation?.counterpartRole
          ? `You'll be practicing with a ${situation.counterpartRole}`
          : 'Select a character to practice with'
      }
      label="Choose your practice partner"
    >
      {source === 'fixture' && (
        <div className="mb-4 rounded-md border border-dojo-warning/30 bg-dojo-warning/5 px-4 py-2 text-xs text-dojo-warning">
          Showing offline data — some options may be out of date
        </div>
      )}

      <div className="mb-6 rounded-[--radius-lg] border border-dojo-border bg-dojo-surface p-4">
        <LanguagePicker
          targetLanguage={targetLanguage}
          nativeLanguage={nativeLanguage}
          onTargetChange={setTargetLanguage}
          onNativeChange={setNativeLanguage}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-xl bg-dojo-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((char) => (
            <div key={char.id} className="group rounded-[--radius-lg] border border-dojo-border bg-dojo-surface-raised/50 p-5 transition-colors hover:border-dojo-accent/40">
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
                {char.gender && (
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    char.gender === 'female'
                      ? 'bg-pink-500/10 text-pink-400'
                      : 'bg-sky-500/10 text-sky-400'
                  }`}>
                    {char.gender === 'female' ? '♀' : '♂'} {char.gender}
                  </span>
                )}
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
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
