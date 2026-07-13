'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useFBX, Environment, ContactShadows } from '@react-three/drei';

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function FBXModel({ url }: { url: string }) {
  const fbx = useFBX(url);
  return <primitive object={fbx} scale={0.015} position={[0, -1.2, 0]} rotation={[0, -0.3, 0]} />;
}

function ThreeScene({ modelUrl }: { modelUrl: string }) {
  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [0, 1.2, 3.5], fov: 35 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 4, 4]} intensity={0.8} />
        <directionalLight position={[-3, 2, 3]} intensity={0.3} color="#b0d0ff" />
        <directionalLight position={[0, -2, 2]} intensity={0.2} />
        <Suspense fallback={null}>
          <FBXModel url={modelUrl} />
          <Environment preset="studio" />
          <ContactShadows
            position={[0, -1.5, 0]}
            opacity={0.4}
            scale={3}
            blur={2}
            far={4}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function AvatarViewport({
  name,
  accentColor,
  portraitSrc,
}: {
  name: string;
  accentColor: string;
  portraitSrc?: string;
}) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWebglSupported(detectWebGLSupport());
  }, []);

  if (webglSupported === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-lg">
        <div className="h-16 w-16 rounded-full bg-dojo-border" />
      </div>
    );
  }

  if (!webglSupported) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-dojo-surface to-dojo-canvas rounded-lg" ref={containerRef}>
        <div
          className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-lg"
          style={{ backgroundColor: accentColor }}
        >
          {name[0]}
        </div>
      </div>
    );
  }

  return <ThreeScene modelUrl="/avatar.fbx" />;
}
