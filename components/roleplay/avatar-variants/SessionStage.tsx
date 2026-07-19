'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import {
  AnimatedModel,
  EmotionLight,
  ModelLoader,
  CameraIntent,
} from '@/components/roleplay/three/AnimatedModel';

export type AvatarMode = 'idle' | 'listening' | 'talking';

interface AvatarConfig {
  modelUrl?: string;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
  cameraIntent: CameraIntent;
}

interface SessionStageProps {
  ai: AvatarConfig;
  user: AvatarConfig;
}

export function SessionStage({ ai, user }: SessionStageProps) {
  const hasAiModel   = !!ai.modelUrl;
  const hasUserModel = !!user.modelUrl;

  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 1.2, 4.5], fov: 35, near: 0.1, far: 20 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.warn('[SessionStage] WebGL context restored by R3F');
          });
        }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 4, 4]} intensity={0.8} />
        <directionalLight position={[-3, 2, 3]} intensity={0.3} color="#b0d0ff" />
        <directionalLight position={[0, -2, 2]} intensity={0.2} />
        <ModelLoader />
        <Suspense fallback={null}>
          {hasAiModel && (
            <group position={[-1.1, 0, 0]}>
              <AnimatedModel
                url={ai.modelUrl!}
                mode={ai.mode ?? 'idle'}
                emotion={ai.emotion}
                gesture={ai.gesture}
                cameraIntent={ai.cameraIntent}
                disableAutoCamera
              />
            </group>
          )}
          {hasUserModel && (
            <group position={[1.1, 0, 0]}>
              <AnimatedModel
                url={user.modelUrl!}
                mode={user.mode ?? 'idle'}
                emotion={user.emotion}
                gesture={user.gesture}
                cameraIntent={user.cameraIntent}
                disableAutoCamera
              />
            </group>
          )}
          <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={6} blur={2} far={4} />
        </Suspense>
        <Suspense fallback={null}>
          <Environment files="/studio_small_03_1k.hdr" />
        </Suspense>
      </Canvas>
    </div>
  );
}
