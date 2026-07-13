'use client';

import { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useFBX, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { getCurrentAmplitude } from '@/lib/roleplay/tts';

/* ── Emotion → blend shape weight mapping ────────
   These values are applied as weights when morph targets exist.
   If no morph targets are found, the same emotions drive
   bone/transform-based poses instead (see PoseController).
   ──────────────────────────────────────────────── */

type AvatarMode = 'idle' | 'listening' | 'talking';

interface AvatarAnimationProps {
  mode: AvatarMode;
  emotion?: string;
  gesture?: string;
}

/* ── Pose definitions for each emotion/gesture ───
   Used when the FBX has no morph targets.
   Values: [headTiltX, headTiltY, bodyLeanZ, scale] offsets.
   ──────────────────────────────────────────────── */

const EMOTION_POSES: Record<string, [number, number, number, number]> = {
  friendly:       [0.02, 0.05, 0, 0],
  concerned:      [0.04, -0.02, 0.02, 0],
  'formal-polite': [0, 0, -0.01, 0],
  surprised:      [0.08, 0, -0.03, 0],
  grateful:       [0.03, 0.06, -0.02, 0],
  apologetic:     [0.06, 0, 0.04, 0],
};

const GESTURE_POSES: Record<string, [number, number, number, number]> = {
  'slight bow':   [0.12, 0, 0.06, 0],
  'bows':         [0.2, 0, 0.1, 0],
  nods:           [0.1, 0, 0, 0],
  'nods while speaking': [0.08, 0.02, 0, 0],
};

function lerp(current: number, target: number, speed: number): number {
  return current + (target - current) * speed;
}

/* ── Checks for morph targets on the loaded FBX ── */
function checkMorphTargets(fbx: THREE.Group): boolean {
  let hasMorphs = false;
  fbx.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh && child.morphTargetInfluences) {
      hasMorphs = true;
    }
  });
  return hasMorphs;
}

/* ── Emotion-coloured accent light ────────────────
   Adds a subtle coloured rim light that shifts with
   the character's emotion tone.
   ──────────────────────────────────────────────── */

const EMOTION_COLORS: Record<string, string> = {
  friendly:       '#ffd4a0',
  concerned:      '#a0c4ff',
  'formal-polite': '#c8d0e0',
  surprised:      '#ffe066',
  grateful:       '#ffb3b3',
  apologetic:     '#b3b3cc',
};

function EmotionLight({ emotion }: { emotion?: string }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetColor = useMemo(() => {
    const hex = EMOTION_COLORS[emotion ?? ''] ?? '#ffffff';
    return new THREE.Color(hex);
  }, [emotion]);

  useFrame((_, delta) => {
    if (lightRef.current) {
      lightRef.current.color.lerp(targetColor, delta * 2);
    }
  });

  return <directionalLight ref={lightRef} position={[-2, 3, 3]} intensity={0.4} />;
}

/* ── Pose controller — applies emotion/gesture transforms ── */
function PoseController({ fbx, mode, emotion, gesture }: { fbx: THREE.Group } & AvatarAnimationProps) {
  const timeRef = useRef(0);
  const currentPose = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const targetPose = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  useFrame((_, delta) => {
    timeRef.current += delta;

    // Determine target pose from emotion + gesture
    const basePose: [number, number, number, number] = [0, 0, 0, 0];
    if (emotion && EMOTION_POSES[emotion]) {
      const p = EMOTION_POSES[emotion];
      basePose[0] += p[0]; basePose[1] += p[1]; basePose[2] += p[2];
    }
    if (gesture && GESTURE_POSES[gesture]) {
      const p = GESTURE_POSES[gesture];
      basePose[0] += p[0]; basePose[1] += p[1]; basePose[2] += p[2];
    }

    // Mode-driven animation
    if (mode === 'talking') {
      const bounce = Math.sin(timeRef.current * 12) * 0.015;
      basePose[0] += bounce;
    } else if (mode === 'listening') {
      // Subtle attentive tilt
      basePose[1] += Math.sin(timeRef.current * 0.5) * 0.02;
    } else {
      // Idle breathing
      const breath = Math.sin(timeRef.current * 2) * 0.008;
      basePose[2] += breath;
    }

    // Smooth lerp toward target
    for (let i = 0; i < 4; i++) {
      currentPose.current[i] = lerp(currentPose.current[i], basePose[i], delta * 4);
    }

    // Apply to model root
    fbx.rotation.x = currentPose.current[0];
    fbx.rotation.z = currentPose.current[1];
    fbx.position.y = -1.2 + currentPose.current[2];
  });

  return null;
}

/* ── MorphTargetController — drives blend shapes ──
   Only active when the FBX has morph targets.
   Assumes common blend shape names like:
     "jawOpen", "mouthSmile", "mouthClose", "browRaise"
   Maps emotion values to plausible shape weights.
   ──────────────────────────────────────────────── */

function MorphTargetController({ fbx, mode, emotion }: { fbx: THREE.Group } & AvatarAnimationProps) {
  const meshes = useMemo(() => {
    const found: THREE.SkinnedMesh[] = [];
    fbx.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.morphTargetDictionary) {
        found.push(child);
      }
    });
    return found;
  }, [fbx]);

  const timeRef = useRef(0);

  const mouthOpenTarget = useRef(0);
  const smileTarget = useRef(0);
  const browTarget = useRef(0);

  const targetValues = useMemo(() => {
    const mouthOpen = mode === 'talking' ? 0.6 : 0;
    let smile = 0;
    let brow = 0;

    if (emotion === 'friendly' || emotion === 'grateful') smile = 0.5;
    if (emotion === 'surprised') { smile = 0.3; brow = 0.7; }
    if (emotion === 'concerned' || emotion === 'apologetic') { brow = 0.3; }
    if (emotion === 'formal-polite') smile = 0.1;

    return { mouthOpen, smile, brow };
  }, [mode, emotion]);

  useFrame((_, delta) => {
    timeRef.current += delta;

    mouthOpenTarget.current = lerp(mouthOpenTarget.current, targetValues.mouthOpen, delta * 6);
    smileTarget.current = lerp(smileTarget.current, targetValues.smile, delta * 4);
    browTarget.current = lerp(browTarget.current, targetValues.brow, delta * 4);

    for (const mesh of meshes) {
      if (!mesh.morphTargetDictionary) continue;
      const dict = mesh.morphTargetDictionary;

      // Try common jaw/mouth shape keys
      for (const key of ['jawOpen', 'jaw_down', 'MouthOpen', 'jaw_drop']) {
        if (key in dict) {
          // Use amplitude from TTS for talking, fallback to time-based oscillation
          const amp = mode === 'talking' ? Math.max(getCurrentAmplitude(), Math.sin(timeRef.current * 20) * 0.3 + 0.3) : 0;
          mesh.morphTargetInfluences![dict[key]] = amp * mouthOpenTarget.current;
        }
      }
      if ('mouthSmile' in dict || 'MouthSmile' in dict) {
        const key = 'mouthSmile' in dict ? 'mouthSmile' : 'MouthSmile';
        mesh.morphTargetInfluences![dict[key]] = smileTarget.current;
      }
      for (const key of ['browRaise', 'brow_raise', 'BrowRaise']) {
        if (key in dict) {
          mesh.morphTargetInfluences![dict[key]] = browTarget.current;
        }
      }
    }
  });

  return null;
}

/* ── AnimatedFBX — loads and animates the model ── */
function AnimatedFBX({ url, mode, emotion, gesture }: { url: string } & AvatarAnimationProps) {
  const fbx = useFBX(url);
  const [hasMorphs, setHasMorphs] = useState(false);

  useEffect(() => {
    if (fbx) {
      setHasMorphs(checkMorphTargets(fbx));
    }
  }, [fbx]);

  return (
    <group>
      <primitive object={fbx} scale={0.015} rotation={[0, -0.3, 0]} />
      {hasMorphs ? (
        <MorphTargetController fbx={fbx} mode={mode} emotion={emotion} gesture={gesture} />
      ) : (
        <PoseController fbx={fbx} mode={mode} emotion={emotion} gesture={gesture} />
      )}
    </group>
  );
}

/* ── ThreeScene ───────────────────────────────── */
function ThreeScene({
  modelUrl,
  mode,
  emotion,
  gesture,
  accentColor,
}: {
  modelUrl: string;
  accentColor: string;
} & AvatarAnimationProps) {
  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [0, 1.2, 3.5], fov: 35 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 4, 4]} intensity={0.8} />
        <directionalLight position={[-3, 2, 3]} intensity={0.3} color="#b0d0ff" />
        <directionalLight position={[0, -2, 2]} intensity={0.2} />
        <EmotionLight emotion={emotion} />
        <Suspense fallback={null}>
          <AnimatedFBX url={modelUrl} mode={mode} emotion={emotion} gesture={gesture} />
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

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/* ── Exported component ───────────────────────── */
export function AvatarViewport({
  name,
  accentColor,
  portraitSrc,
  mode = 'idle',
  emotion,
  gesture,
}: {
  name: string;
  accentColor: string;
  portraitSrc?: string;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
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

  return (
    <ThreeScene
      modelUrl="/avatar.fbx"
      mode={mode}
      emotion={emotion}
      gesture={gesture}
      accentColor={accentColor}
    />
  );
}
