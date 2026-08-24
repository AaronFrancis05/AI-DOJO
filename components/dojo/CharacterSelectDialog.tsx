/* ───────────────────────────────────────────────
   CharacterSelectDialog — choose practice partner + languages
   as a dialogue section over the situation detail page
   Reworked to render exactly two gender cards (female_ug &
   male_jp) with a per-gender "Change avatar" picker that can
   surface any catalog avatar of that gender. The chosen
   avatar's catalog profile (name/persona/thumbnail) is shown
   on the card and forwarded as `avatarId` to /api/sessions
   so the server creates the scenario with that avatar's
   display name.
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
import { getCharacters } from '@/lib/data/characters';
import { AVATAR_SOURCES, FEMALE_AVATAR_IDS, type AvatarSource } from '@/lib/avatar/catalog';
import { ChevronRight, Shuffle, Check } from 'lucide-react';

const SESSION_START_TIMEOUT_MS = 30_000;

const FEMALE_DEFAULT_ID = 'female_ug';
const MALE_DEFAULT_ID = 'male_jp';

interface CharacterSelectDialogProps {
  open: boolean;
  onClose: () => void;
  domainSlug: string;
  situationId: string;
  behaviorMode: string;
}

const defaultFemale = (): AvatarSource =>
  AVATAR_SOURCES.find(a => a.id === FEMALE_DEFAULT_ID) ?? AVATAR_SOURCES[0];
const defaultMale = (): AvatarSource =>
  AVATAR_SOURCES.find(a => a.id === MALE_DEFAULT_ID) ?? AVATAR_SOURCES[1] ?? AVATAR_SOURCES[0];

function avatarRoleSnippet(a: AvatarSource): string {
  // Keep role line short for the card — first sentence of persona
  const first = a.persona.split(/[.!?]\s/)[0] ?? a.persona;
  return first.length > 92 ? first.slice(0, 89) + '…' : first;
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
  const [charsLoaded, setCharsLoaded] = useState(false);
  const [source, setSource] = useState<'live' | 'fixture'>('live');
  const loading = open && !charsLoaded;

  const [targetLanguage, setTargetLanguage] = useState('ja');
  const [nativeLanguage, setNativeLanguage] = useState('en');

  const [femalePick, setFemalePick] = useState<AvatarSource>(defaultFemale);
  const [malePick, setMalePick] = useState<AvatarSource>(defaultMale);

  // Which picker's grid is open — null means no picker
  const [pickerGender, setPickerGender] = useState<'female' | 'male' | null>(null);

  // Guards against a double-press starting two sessions: /api/sessions can take
  // seconds, and both cards stay clickable for the whole wait otherwise.
  const [starting, setStarting] = useState(false);

  // Reset when the dialog opens so a previous custom choice doesn't leak, and
  // clear `starting` on either transition so a dialog cancelled mid-request
  // isn't left with both buttons disabled. Done during render rather than in an
  // effect — an effect would paint the stale picks for one frame first.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setStarting(false);
    if (open) {
      setFemalePick(defaultFemale());
      setMalePick(defaultMale());
      setPickerGender(null);
    }
  }

  const situationIdNum = Number(situationId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      const [sitRes, domRes, charsRes, statsRes] = await Promise.all([
        getSituationById(situationIdNum),
        getDomainBySlug(domainSlug),
        getCharacters(),
        fetch('/api/user/stats', { credentials: 'include' })
          .then(r => r.json() as Promise<Record<string, unknown>>)
          .catch(() => ({} as Record<string, unknown>)),
      ]);
      if (cancelled) return;
      setSituation(sitRes.situation);
      setSource(charsRes.source);

      const stats = statsRes.success && typeof statsRes.stats === 'object' && statsRes.stats !== null
        ? statsRes.stats as { preferredTargetLanguage?: string; nativeLanguage?: string }
        : null;
      if (stats?.preferredTargetLanguage) setTargetLanguage(stats.preferredTargetLanguage);
      if (stats?.nativeLanguage) setNativeLanguage(stats.nativeLanguage);

      // Keep defaults on catalog entries, but if live characters exist we
      // keep their color for the two defaults' accentColor fallback.
      // No per-domain filtering — the brief is exactly one female + one male.
      setCharsLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [open, situationIdNum, domainSlug]);

  const startSession = useCallback(async (avatar: AvatarSource) => {
    if (starting) return;
    setStarting(true);

    // Pre-warm the 3D model so the session route doesn't show a loader
    if (avatar.file) {
      import('@react-three/drei').then(m => m.useGLTF.preload(avatar.file));
    }

    let res: Response;
    try {
      res = await fetch('/api/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(SESSION_START_TIMEOUT_MS),
        body: JSON.stringify({
          situationId: situationIdNum,
          // Keep a null characterId — avatarId is the source of truth now.
          // Sending a characterId would re-introduce the domain-match guard.
          characterId: null,
          avatarId: avatar.id,
          behaviorMode,
          targetLanguage,
          nativeLanguage,
        }),
      });
    } catch (err) {
      console.error('Failed to start session:', err);
      alert('Failed to start session — try again.');
      setStarting(false);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string }));
      alert(body.error ?? 'Failed to start session — try again.');
      setStarting(false);
      return;
    }
    const body = await res.json();
    // Left `starting` set on success: the route change is what ends this
    // dialog, and re-enabling the buttons first only invites a second press.
    router.push(`/session/${body.session.id}`);
  }, [starting, situationIdNum, behaviorMode, targetLanguage, nativeLanguage, router]);

  const femaleOptions = AVATAR_SOURCES.filter(a => FEMALE_AVATAR_IDS.has(a.id));
  const maleOptions = AVATAR_SOURCES.filter(a => !FEMALE_AVATAR_IDS.has(a.id));

  const pickerOptions = pickerGender === 'female' ? femaleOptions : pickerGender === 'male' ? maleOptions : [];
  const pickerSelectedId = pickerGender === 'female' ? femalePick.id : pickerGender === 'male' ? malePick.id : '';

  return (
    <>
      <Dialog
        open={open && pickerGender === null}
        onClose={onClose}
        size="xl"
        title="Choose Your Practice Partner"
        subtitle={
          situation?.counterpartRole
            ? `You'll be practicing with a ${situation.counterpartRole}`
            : 'Select a partner — one female, one male — then swap within that gender if you like'
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2].map(i => (
              <div key={i} className="h-96 rounded-xl bg-dojo-surface animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { gender: 'female' as const, avatar: femalePick, accent: '#E91E63' },
              { gender: 'male' as const, avatar: malePick, accent: '#1976D2' },
            ].map(({ gender, avatar, accent }) => (
              <div key={gender} className="group flex flex-col rounded-[--radius-lg] border border-dojo-border bg-dojo-surface-raised/50 p-5 transition-colors hover:border-dojo-accent/40">
                <div className="flex flex-col items-center text-center flex-1">
                  <div className="h-40 w-full">
                    <CharacterPreviewCard
                      name={avatar.name}
                      role={avatarRoleSnippet(avatar)}
                      accentColor={accent}
                      modelUrl={avatar.file}
                      domainSlug={domainSlug}
                    />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-dojo-text-primary">{avatar.name}</h3>
                  <p className="text-xs text-dojo-text-muted line-clamp-1">{avatarRoleSnippet(avatar)}</p>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs leading-none font-medium ${
                    gender === 'female'
                      ? 'bg-pink-500/10 text-pink-400'
                      : 'bg-sky-500/10 text-sky-400'
                  }`}>
                    {gender === 'female' ? '♀' : '♂'} {gender} · {avatar.name}
                  </span>
                  <p className="mt-2 text-xs text-dojo-text-muted leading-relaxed line-clamp-3">{avatar.persona}</p>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={starting}
                    onClick={() => setPickerGender(gender)}
                  >
                    <Shuffle className="mr-1.5 h-3.5 w-3.5" />
                    Change avatar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    loading={starting}
                    onClick={() => startSession(avatar)}
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

      {/* Per-gender avatar picker */}
      <Dialog
        open={pickerGender !== null}
        onClose={() => setPickerGender(null)}
        size="xl"
        title={pickerGender === 'female' ? 'Choose a female avatar' : 'Choose a male avatar'}
        subtitle={`${pickerOptions.length} options — each has its own portrait and persona`}
        label="Choose avatar"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {pickerOptions.map((av) => {
            const selected = av.id === pickerSelectedId;
            return (
              <button
                key={av.id}
                onClick={() => {
                  if (pickerGender === 'female') setFemalePick(av);
                  else if (pickerGender === 'male') setMalePick(av);
                  setPickerGender(null);
                }}
                className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                  selected
                    ? 'border-dojo-accent bg-dojo-accent/10'
                    : 'border-dojo-border bg-dojo-surface hover:border-dojo-accent/40 hover:bg-dojo-surface-raised'
                }`}
              >
                {selected && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-dojo-accent text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <img
                  src={av.thumbnail}
                  alt={av.name}
                  className="h-20 w-20 rounded-full object-cover bg-dojo-border"
                  loading="lazy"
                />
                <span className="text-xs font-semibold text-dojo-text-primary line-clamp-1">{av.name}</span>
                <span className="text-xs leading-tight text-dojo-text-muted line-clamp-1">{avatarRoleSnippet(av)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setPickerGender(null)}>Close</Button>
        </div>
      </Dialog>
    </>
  );
}
