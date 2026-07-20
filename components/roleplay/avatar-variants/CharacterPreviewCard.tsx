'use client';

import dynamic from 'next/dynamic';

const AvatarViewport = dynamic(() => import('@/components/roleplay/AvatarViewport').then(m => ({ default: m.AvatarViewport })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-lg">
      <div className="h-12 w-12 rounded-full bg-dojo-border" />
    </div>
  ),
});

const DOMAIN_BACKGROUNDS: Record<string, string> = {
  restaurant:  'linear-gradient(160deg, #1a0f0a 0%, #2d1a10 30%, #1c1814 70%, #0f0d0b 100%)',
  hotel:       'linear-gradient(160deg, #0f1a2d 0%, #1a2d40 30%, #141c24 70%, #0b0f14 100%)',
  airport:     'linear-gradient(160deg, #1a1a2e 0%, #2d2d50 30%, #1c1c30 70%, #0f0f1a 100%)',
  hospital:    'linear-gradient(160deg, #0f1a14 0%, #1a2d24 30%, #141c18 70%, #0b0f0d 100%)',
  shopping:    'linear-gradient(160deg, #1a0f1a 0%, #2d1a2d 30%, #1c141c 70%, #0f0b0f 100%)',
  business:    'linear-gradient(160deg, #0f141a 0%, #1a2430 30%, #14181c 70%, #0b0d0f 100%)',
  travel:      'linear-gradient(160deg, #0f1a1a 0%, #1a2d2d 30%, #141c1c 70%, #0b0f0f 100%)',
  daily_life:  'linear-gradient(160deg, #14140f 0%, #24241a 30%, #181814 70%, #0d0d0b 100%)',
};

function getDomainBackground(slug?: string): string {
  if (slug && DOMAIN_BACKGROUNDS[slug]) return DOMAIN_BACKGROUNDS[slug];
  return 'linear-gradient(160deg, #111D33 0%, #1C2A42 50%, #0F1628 100%)';
}

interface CharacterPreviewCardProps {
  name: string;
  role: string;
  accentColor: string;
  modelUrl?: string;
  domainSlug?: string;
}

export function CharacterPreviewCard({
  name,
  role,
  accentColor,
  modelUrl,
  domainSlug,
}: CharacterPreviewCardProps) {
  const bg = getDomainBackground(domainSlug);

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg"
      style={{ background: bg }}
    >
      {modelUrl ? (
        <AvatarViewport
          name={name}
          accentColor={accentColor}
          cameraMode="front"
          cameraIntent="face-camera"
          modelUrl={modelUrl}
          mode="idle"
        />
      ) : (
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{ backgroundColor: accentColor }}
        >
          {name[0]}
        </div>
      )}
    </div>
  );
}
