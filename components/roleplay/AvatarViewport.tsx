'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import {
  AnimatedModel,
  EmotionLight,
  ModelLoader,
  CameraIntent,
  CameraMode,
  getDevWarnings,
  clearDevWarnings,
} from '@/components/roleplay/three/AnimatedModel';

/* ── Error boundary around the Canvas ──────────────── */
class AvatarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AvatarErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="absolute top-0 left-0 z-50 bg-red-900/90 text-white text-[11px] p-2 max-w-[320px] rounded-br">
          Avatar crashed: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Dev warning overlay ──────────────────────────── */
function DevOverlay() {
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    setWarnings(getDevWarnings());
    return () => { clearDevWarnings(); };
  }, []);
  if (warnings.length === 0) return null;
  return (
    <div className="absolute top-0 left-0 z-50 bg-red-900/80 text-white text-[10px] p-2 max-w-[300px] rounded-br pointer-events-none">
      {warnings.map((w, i) => <div key={i}>{w}</div>)}
    </div>
  );
}

/* ── ThreeScene ─────────────────────────────────── */
type AvatarMode = 'idle' | 'listening' | 'talking';

function ThreeScene({ modelUrl, mode, emotion, gesture, cameraMode, cameraIntent, onFramed, freezeOnIdle }: {
  modelUrl: string;
  cameraMode?: CameraMode;
  cameraIntent: CameraIntent;
  onFramed?: () => void;
  freezeOnIdle?: boolean;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
}) {
  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0, 3], fov: 35 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.warn('[ThreeScene] WebGL context restored by R3F');
          });
        }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 4, 4]} intensity={0.8} />
        <directionalLight position={[-3, 2, 3]} intensity={0.3} color="#b0d0ff" />
        <directionalLight position={[0, -2, 2]} intensity={0.2} />
        <EmotionLight emotion={emotion} />
        <ModelLoader />
        <Suspense fallback={null}>
          <AnimatedModel
            url={modelUrl}
            mode={mode ?? 'idle'}
            emotion={emotion}
            gesture={gesture}
            cameraMode={cameraMode}
            cameraIntent={cameraIntent}
            onFramed={onFramed}
            freezeOnIdle={freezeOnIdle}
          />
          {cameraMode !== 'over-shoulder' && (
            <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={3} blur={2} far={4} />
          )}
        </Suspense>
        <Suspense fallback={null}>
          <Environment files="/studio_small_03_1k.hdr" />
        </Suspense>
      </Canvas>
    </div>
  );
}

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
  } catch { return false; }
}

/* ── Exported component ──────────────────────────── */
export function AvatarViewport({
  name, accentColor, mode = 'idle', emotion, gesture, cameraMode, modelUrl, cameraIntent = 'face-camera', onFramed, freezeOnIdle,
}: {
  name: string;
  accentColor: string;
  portraitSrc?: string;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
  cameraMode?: CameraMode;
  modelUrl?: string;
  cameraIntent?: CameraIntent;
  onFramed?: () => void;
  freezeOnIdle?: boolean;
}) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [framed, setFramed] = useState(false);

  useEffect(() => { setWebglSupported(detectWebGLSupport()); }, []);

  if (webglSupported === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-dojo-surface animate-pulse rounded-lg">
        <div className="h-16 w-16 rounded-full bg-dojo-border" />
      </div>
    );
  }

  if (!webglSupported) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-dojo-surface to-dojo-canvas rounded-lg">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-lg"
          style={{ backgroundColor: accentColor }}
        >
          {name[0]}
        </div>
      </div>
    );
  }

  if (!modelUrl) return null;

  return (
    <div className="relative h-full w-full">
      <DevOverlay />
      <AvatarErrorBoundary>
        <div className={`h-full w-full transition-opacity duration-200 ${framed ? 'opacity-100' : 'opacity-0'}`}>
          <ThreeScene
            modelUrl={modelUrl}
            mode={mode}
            emotion={emotion}
            gesture={gesture}
            cameraMode={cameraMode}
            cameraIntent={cameraIntent}
            freezeOnIdle={freezeOnIdle}
            onFramed={() => {
              setFramed(true);
              onFramed?.();
            }}
          />
        </div>
      </AvatarErrorBoundary>
    </div>
  );
}
