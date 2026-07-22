'use client';

import dynamic from 'next/dynamic';

const AvatarViewport = dynamic(() => import('@/components/roleplay/AvatarViewport3D').then(m => ({ default: m.AvatarViewport3D })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-lg">
      <div className="h-16 w-16 rounded-full bg-dojo-border" />
    </div>
  ),
});

export type AvatarMode = 'idle' | 'listening' | 'talking';

interface ConversationStageProps {
  side: 'left' | 'right';
  name: string;
  accentColor: string;
  modelUrl?: string;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
}

export function ConversationStage({
  side,
  name,
  accentColor,
  modelUrl,
  mode = 'idle',
  emotion,
  gesture,
}: ConversationStageProps) {
  if (!modelUrl) return null;

  return (
    <div className="h-full w-full">
      <AvatarViewport
        name={name}
        accentColor={accentColor}
        mode={mode}
        emotion={emotion}
        gesture={gesture}
        cameraMode="front"
        cameraIntent={side === 'left' ? 'face-partner-left' : 'face-partner-right'}
        modelUrl={modelUrl}
      />
    </div>
  );
}
