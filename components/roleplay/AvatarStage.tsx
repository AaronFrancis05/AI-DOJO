'use client';

import dynamic from 'next/dynamic';

const AvatarViewport = dynamic(() => import('./AvatarViewport').then(m => ({ default: m.AvatarViewport })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-lg">
      <div className="h-12 w-12 rounded-full bg-dojo-border" />
    </div>
  ),
});

export interface AvatarState {
  emotion?: string;
  gesture?: string;
}

interface AvatarStageProps {
  name: string;
  role: string;
  accentColor: string;
  modelUrl?: string;
  domainSlug?: string;
  state?: AvatarState;
  compact?: boolean;
  mode?: 'idle' | 'listening' | 'talking';
}

/* ── Domain background gradients ──────────────────
   Each domain gets a distinct atmospheric background
   that sits behind the WebGL canvas as a CSS layer.
   This is cheaper than in-scene geometry and doesn't
   interfere with the 3D lighting setup.
   ──────────────────────────────────────────────── */

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

export function AvatarStage({
  name,
  role,
  accentColor,
  modelUrl,
  domainSlug,
  state,
  compact,
  mode = 'idle',
}: AvatarStageProps) {
  const bg = getDomainBackground(domainSlug);

  if (compact) {
    return (
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-dojo-border"
        style={{ background: bg }}
      >
        <AvatarViewport
          name={name}
          accentColor={accentColor}
          mode={mode}
          emotion={state?.emotion}
          gesture={state?.gesture}
          modelUrl={modelUrl}
        />
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dojo-border shadow-sm"
      style={{ background: bg }}
    >
      <div className="relative z-10 flex flex-col items-center w-full h-full">
        <div className="flex-1 w-full min-h-0">
          <AvatarViewport
            name={name}
            accentColor={accentColor}
            mode={mode}
            emotion={state?.emotion}
            gesture={state?.gesture}
            modelUrl={modelUrl}
          />
        </div>
        <div className="pb-4 pt-2 text-center">
          <p className="text-base font-semibold text-dojo-text-primary">{name}</p>
          <p className="text-xs text-dojo-text-muted">{role}</p>
          {state?.emotion && (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-dojo-text-muted capitalize">
              {state.emotion}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
