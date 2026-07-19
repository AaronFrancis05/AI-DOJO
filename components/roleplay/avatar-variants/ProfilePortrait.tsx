'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

const AvatarViewport = dynamic(() => import('@/components/roleplay/AvatarViewport').then(m => ({ default: m.AvatarViewport })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-full">
      <div className="h-8 w-8 rounded-full bg-dojo-border" />
    </div>
  ),
});

interface ProfilePortraitProps {
  modelUrl?: string;
  userName?: string;
}

export function ProfilePortrait({ modelUrl, userName }: ProfilePortraitProps) {
  const [hasGreeted, setHasGreeted] = useState(false);
  const greetedRef = useRef(false);

  if (!modelUrl) return null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-full bg-dojo-surface">
      <AvatarViewport
        name={userName ?? 'You'}
        accentColor="#2D3BC5"
        cameraMode="portrait"
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
