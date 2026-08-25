'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, useProgress } from '@react-three/drei';
import { EmotionSystem } from '@/components/roleplay/three/EmotionSystem';
import {
  AnimatedModel,
  EmotionLight,
  CameraIntent,
  CameraMode,
  getDevWarnings,
  subscribeWarnings,
} from '@/components/roleplay/three/AnimatedModel';
import { preloadAnimationClips } from '@/components/roleplay/three/AnimationManager';
import { AvatarCaptionsOverlay } from '@/components/roleplay/AvatarCaptionsOverlay';
import { SHARED_FEMALE_MODEL_URL, resolveAvatarModelUrl } from '@/lib/avatar/catalog';

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
  const [warnings, setWarnings] = useState<string[]>(() => getDevWarnings());
  useEffect(() => {
    const unsub = subscribeWarnings(() => {
      setWarnings(getDevWarnings());
    });
    return unsub;
  }, []);
  if (warnings.length === 0) return null;
  return (
    <div className="absolute top-0 left-0 z-50 bg-red-900/80 text-white text-[10px] p-2 max-w-[300px] rounded-br pointer-events-none">
      {warnings.map((w, i) => <div key={i}>{w}</div>)}
    </div>
  );
}

/* ── Loading indicator ──────────────────────────────
   Lives in the DOM rather than inside the Canvas so it stays visible while
   the 3D content is still faded out, and so its progress ticks don't
   re-render the scene. */
function AvatarLoadingIndicator({ name }: { name: string }) {
  const { progress } = useProgress();
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-1 w-32 overflow-hidden rounded-full bg-dojo-border/60">
          <div
            className="h-full rounded-full bg-dojo-accent transition-[width] duration-300"
            style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
          />
        </div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-dojo-text-muted">
          Preparing {name}
        </p>
      </div>
    </div>
  );
}

/* ── ThreeScene ─────────────────────────────────── */
type AvatarMode = 'idle' | 'listening' | 'talking';

function ThreeScene({ modelUrl, mode, emotion, gesture, cameraMode, cameraIntent, onFramed, onReady, freezeOnIdle, onSystemReady }: {
  modelUrl: string;
  cameraMode?: CameraMode;
  cameraIntent: CameraIntent;
  onFramed?: () => void;
  onReady?: () => void;
  freezeOnIdle?: boolean;
  onSystemReady?: (system: EmotionSystem) => void;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
}) {
  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 1.2, 3.5], fov: 42 }}
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
        <Suspense fallback={null}>
          <AnimatedModel
            url={modelUrl}
            mode={mode ?? 'idle'}
            emotion={emotion}
            gesture={gesture}
            cameraMode={cameraMode}
            cameraIntent={cameraIntent}
            onFramed={onFramed}
            onReady={onReady}
            freezeOnIdle={freezeOnIdle}
            onSystemReady={onSystemReady}
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

export const DEFAULT_AVATAR_MODEL_URL = SHARED_FEMALE_MODEL_URL;

/* ── Exported component ──────────────────────────── */
export function AvatarViewport3D({
  name, accentColor, mode = 'idle', emotion, gesture, cameraMode, modelUrl, cameraIntent = 'face-camera', onFramed, freezeOnIdle, onSystemReady, caption,
}: {
  name: string;
  accentColor: string;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
  cameraMode?: CameraMode;
  modelUrl?: string;
  cameraIntent?: CameraIntent;
  onFramed?: () => void;
  freezeOnIdle?: boolean;
  onSystemReady?: (system: EmotionSystem) => void;
  caption?: string | null;
}) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [framed, setFramed] = useState(false);
  const [posed, setPosed] = useState(false);

  // Every render path funnels through here, so resolving the female swap at
  // this point covers catalog picks and character rows seeded with their own
  // per-character GLB alike.
  const activeModelUrl = resolveAvatarModelUrl(modelUrl) || DEFAULT_AVATAR_MODEL_URL;

  const onFramedRef = useRef(onFramed);
  useEffect(() => {
    onFramedRef.current = onFramed;
  }, [onFramed]);

  const framedRef = useRef(framed);
  useEffect(() => {
    framedRef.current = framed;
  }, [framed]);

  useEffect(() => { setWebglSupported(detectWebGLSupport()); }, []);

  // Starts the clip download alongside the character GLB instead of after it:
  // the manager can only ask for clips once the model has finished parsing.
  useEffect(() => { preloadAnimationClips(); }, []);

  // Safety timer so the viewport is guaranteed to show even if camera auto-framing calculation takes extra frames
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!framedRef.current) {
        setFramed(true);
        onFramedRef.current?.();
      }
    }, 1000);
    return () => clearTimeout(timer);
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

  // Both have to land before anything is shown: `framed` is the camera, `posed`
  // is the character standing in its idle animation.
  const revealed = framed && posed;

  return (
    <div className="relative h-full w-full">
      <DevOverlay />
      {!revealed && <AvatarLoadingIndicator name={name} />}
      <AvatarErrorBoundary>
        <div className={`h-full w-full transition-opacity duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`}>
          <ThreeScene
            modelUrl={activeModelUrl}
            mode={mode}
            emotion={emotion}
            gesture={gesture}
            cameraMode={cameraMode}
            cameraIntent={cameraIntent}
            freezeOnIdle={freezeOnIdle}
            onSystemReady={onSystemReady}
            onReady={() => setPosed(true)}
            onFramed={() => {
              setFramed(true);
              onFramedRef.current?.();
            }}
          />
        </div>
      </AvatarErrorBoundary>
      <AvatarCaptionsOverlay caption={caption ?? null} />
    </div>
  );
}
