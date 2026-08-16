'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import AvatarSettingsOnly from '@/components/avatar/AvatarSettingOnly';
import { useAvatarProfile } from '@/lib/avatar/useAvatarProfile';
import { ChevronRight } from 'lucide-react';

const DOMAIN_BACKGROUNDS: Record<string, string> = {
  restaurant: 'linear-gradient(160deg, #1a0f0a 0%, #2d1a10 30%, #1c1814 70%, #0f0d0b 100%)',
  hotel: 'linear-gradient(160deg, #0f1a2d 0%, #1a2d40 30%, #141c24 70%, #0b0f14 100%)',
  airport: 'linear-gradient(160deg, #1a1a2e 0%, #2d2d50 30%, #1c1c30 70%, #0f0f1a 100%)',
  hospital: 'linear-gradient(160deg, #0f1a14 0%, #1a2d24 30%, #141c18 70%, #0b0f0d 100%)',
  shopping: 'linear-gradient(160deg, #1a0f1a 0%, #2d1a2d 30%, #1c141c 70%, #0f0b0f 100%)',
  business: 'linear-gradient(160deg, #0f141a 0%, #1a2430 30%, #14181c 70%, #0b0d0f 100%)',
  travel: 'linear-gradient(160deg, #0f1a1a 0%, #1a2d2d 30%, #141c1c 70%, #0b0f0f 100%)',
  daily_life: 'linear-gradient(160deg, #14140f 0%, #24241a 30%, #181814 70%, #0d0d0b 100%)',
};

function getDomainBackground(slug?: string): string {
  if (slug && DOMAIN_BACKGROUNDS[slug]) return DOMAIN_BACKGROUNDS[slug];
  return 'linear-gradient(160deg, #111D33 0%, #1C2A42 50%, #0F1628 100%)';
}

interface CharacterPreviewCardProps {
  name: string;
  role: string;
  instance: string;
  appId?: string;
  userId?: string;
  settingsGroup?: string;
  backend?: string;
  domainSlug?: string;
  characterId: number;
  avatarModelUrl?: string | null;
  onStart: (characterId: number, avatarModelUrl?: string | null) => void;
}

export function CharacterPreviewCard({
  name,
  role,
  instance,
  appId = 'ai-dojo',
  userId,
  settingsGroup,
  backend = '/api/avatar',
  domainSlug,
  characterId,
  avatarModelUrl,
  onStart,
}: CharacterPreviewCardProps) {
  const bg = getDomainBackground(domainSlug);
  const { profile, status } = useAvatarProfile(instance);

  const isSyncingData = status === 'loading' && (!profile || !profile.name);
  const displayName = profile?.name || name;
  const persona = profile?.persona;
  const thumbnail = profile?.thumbnail;

  return (
    <Card hoverable className="group p-5">
      <div className="flex flex-col items-center">
        <div className="h-40 w-full">
          <div
            className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg"
            style={{ background: bg }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-md border border-white/10 bg-black/10">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white bg-dojo-accent"
                  >
                    {displayName[0]}
                  </div>
                </div>
              )}


              <div className="absolute top-2 right-2">
                <AvatarSettingsOnly
                  instance={instance}
                  appId={appId}
                  userId={userId}
                  backend={backend}
                  settingsGroup={settingsGroup}
                />
              </div>
            </div>
          </div>
        </div>

        {isSyncingData ? (
          <div className="mt-3 w-full space-y-2 animate-pulse">
            <div className="mx-auto h-4 w-2/3 rounded bg-dojo-surface" />
            <div className="mx-auto h-3 w-full rounded bg-dojo-surface" />
            <div className="mx-auto h-3 w-5/6 rounded bg-dojo-surface" />
          </div>
        ) : (
          <>
            <h3 className="mt-3 text-sm font-semibold text-dojo-text-primary">
              {displayName}
            </h3>
            {persona && (
              <p className="mt-2 text-[11px] text-dojo-text-muted leading-relaxed">
                {persona}
              </p>
            )}
          </>
        )}

        <Button
          variant="primary"
          size="sm"
          className="mt-4 w-full"
          onClick={() => onStart(characterId, avatarModelUrl)}
        >
          Start Practice
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}