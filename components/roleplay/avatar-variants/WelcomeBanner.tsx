'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

const AvatarViewport = dynamic(() => import('@/components/roleplay/AvatarViewport3D').then(m => ({ default: m.AvatarViewport3D })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-xl">
      <div className="h-12 w-12 rounded-full bg-dojo-border" />
    </div>
  ),
});

interface WelcomeBannerProps {
  modelUrl?: string;
  userName?: string;
}

export function WelcomeBanner({ modelUrl, userName }: WelcomeBannerProps) {
  const [hasGreeted, setHasGreeted] = useState(false);
  const greetedRef = useRef(false);

  if (!modelUrl) return null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <AvatarViewport
        name={userName ?? 'Learner'}
        accentColor="#2D3BC5"
        cameraMode="banner"
        cameraIntent="face-camera"
        modelUrl={modelUrl}
        gesture={hasGreeted ? undefined : 'bow'}
        onFramed={() => {
          if (!greetedRef.current) {
            greetedRef.current = true;
            setHasGreeted(true);
          }
        }}
      />
    </div>
  );
}
