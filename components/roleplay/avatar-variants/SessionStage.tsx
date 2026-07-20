'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import {
  AnimatedModel,
  EmotionLight,
  SceneLoadingFallback,
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
        camera={{ position: [0, 1.15, 3.7], fov: 32, near: 0.1, far: 20 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        shadows="soft"
        style={{ background: 'transparent' }}
        onCreated={({ gl, camera }) => {
          // disableAutoCamera means AutoCamera never runs its own lookAt(),
          // so without this the camera just faces -Z from its position and
          // never actually points at the grounded (y=0) models — that's
          // what reads as the avatars "floating".
          camera.lookAt(0, 0.85, 0);
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.warn('[SessionStage] WebGL context restored by R3F');
          });
        }}
      >
        {/* Lower ambient + stronger key light = more contrast and shape on
            the face/body instead of the flat, evenly-lit look. */}
        <ambientLight intensity={0.28} />
        {/* Key light casts the real shadow — shadow-camera box is tight
            around the two avatars (roughly x:[-2.5,2.5] z:[-1.5,1.5]) so
            the shadow map resolution isn't wasted on empty space. */}
        <directionalLight
          position={[3, 4.5, 3.5]}
          intensity={1.15}
          color="#fff4e0"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-2.5}
          shadow-camera-right={2.5}
          shadow-camera-top={2.5}
          shadow-camera-bottom={-1.5}
          shadow-camera-near={0.5}
          shadow-camera-far={10}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-3, 2, 3]} intensity={0.35} color="#b0d0ff" />
        <directionalLight position={[0, -1, 2.5]} intensity={0.15} />
        <Suspense fallback={<SceneLoadingFallback />}>
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
              {/* Soft ambient-occlusion-style base shadow — subtler now
                  that the directional light above casts the real, pose-
                  accurate shadow. This just fills in the contact point. */}
              <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={1.6} blur={1.4} far={1.2} resolution={512} />
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
              <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={1.6} blur={1.4} far={1.2} resolution={512} />
            </group>
          )}
          {/* Invisible shadow-catcher plane — renders only the real cast
              shadow from the key light (via shadowMaterial), nothing else,
              so it composites cleanly over the gradient backdrop without
              drawing a visible floor mesh. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 6]} />
            <shadowMaterial transparent opacity={0.45} />
          </mesh>
        </Suspense>
        <Suspense fallback={null}>
          <Environment files="/studio_small_03_1k.hdr" />
        </Suspense>
      </Canvas>
    </div>
  );
}