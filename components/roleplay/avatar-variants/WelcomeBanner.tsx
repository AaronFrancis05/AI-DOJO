'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
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
  /** Portrait shown until the learner taps; the 3D model loads only then. */
  thumbnailUrl?: string | null;
  userName?: string;
}

/**
 * The home-page avatar. Starts as a still portrait and becomes the live 3D
 * coach (who bows hello) on tap. Mounting 3D straight away cost every home
 * visit three.js plus a 6–20 MB model, for a 128px circle most learners
 * scroll past.
 */
export function WelcomeBanner({ modelUrl, thumbnailUrl, userName }: WelcomeBannerProps) {
  const [live, setLive] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const greetedRef = useRef(false);

  if (!modelUrl) return null;

  if (!live) {
    return (
      <button
        type="button"
        onClick={() => setLive(true)}
        aria-label="Say hello to your coach"
        className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-dojo-surface"
      >
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            width={128}
            height={128}
            priority
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
          />
        ) : (
          <span className="text-5xl font-bold text-dojo-accent">{userName ? userName[0] : '?'}</span>
        )}
      </button>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <AvatarViewport
        name={userName || ''}
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
