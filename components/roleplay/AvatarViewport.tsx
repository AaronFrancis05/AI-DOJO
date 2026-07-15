'use client';

import { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { getCurrentViseme } from '@/lib/roleplay/tts';

type AvatarMode = 'idle' | 'listening' | 'talking';

interface AvatarAnimationProps {
  mode: AvatarMode;
  emotion?: string;
  gesture?: string;
}

/* ── Emotion pose definitions ───────────────────── */
const EMOTION_POSES: Record<string, [number, number, number, number]> = {
  friendly:       [0.02, 0.05, 0, 0],
  concerned:      [0.04, -0.02, 0.02, 0],
  'formal-polite': [0, 0, -0.01, 0],
  surprised:      [0.08, 0, -0.03, 0],
  grateful:       [0.03, 0.06, -0.02, 0],
  apologetic:     [0.06, 0, 0.04, 0],
};

const GESTURE_POSES: Record<string, [number, number, number, number]> = {
  'slight bow':          [0.12, 0, 0.06, 0],
  'bows':                [0.2, 0, 0.1, 0],
  nods:                  [0.1, 0, 0, 0],
  'nods while speaking': [0.08, 0.02, 0, 0],
};

function lerp(current: number, target: number, speed: number): number {
  return current + (target - current) * speed;
}

function checkMorphTargets(group: THREE.Group): boolean {
  let found = false;
  group.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh && child.morphTargetInfluences) found = true;
  });
  return found;
}

/* ── Emotion accent light ────────────────────────── */
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
    if (lightRef.current) lightRef.current.color.lerp(targetColor, delta * 2);
  });

  return <directionalLight ref={lightRef} position={[-2, 3, 3]} intensity={0.4} />;
}

/* ── PoseController — used when model has NO morph targets ── */
function PoseController({ fbx, mode, emotion, gesture }: { fbx: THREE.Group } & AvatarAnimationProps) {
  const timeRef = useRef(0);
  const currentPose = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  useFrame((_, delta) => {
    timeRef.current += delta;

    const basePose: [number, number, number, number] = [0, 0, 0, 0];
    if (emotion && EMOTION_POSES[emotion]) {
      const p = EMOTION_POSES[emotion];
      basePose[0] += p[0]; basePose[1] += p[1]; basePose[2] += p[2];
    }
    if (gesture && GESTURE_POSES[gesture]) {
      const p = GESTURE_POSES[gesture];
      basePose[0] += p[0]; basePose[1] += p[1]; basePose[2] += p[2];
    }

    if (mode === 'talking') {
      basePose[0] += Math.sin(timeRef.current * 12) * 0.015;
    } else if (mode === 'listening') {
      basePose[1] += Math.sin(timeRef.current * 0.5) * 0.02;
    } else {
      basePose[2] += Math.sin(timeRef.current * 2) * 0.008;
    }

    for (let i = 0; i < 4; i++) {
      currentPose.current[i] = lerp(currentPose.current[i], basePose[i], delta * 4);
    }

    fbx.rotation.x = currentPose.current[0];
    fbx.rotation.z = currentPose.current[1];
    // NOTE: position.y is set here only for no-morph models. AutoCamera already
    // grounds the model via scene.position.y, so we only add the breath offset.
    fbx.position.y = currentPose.current[2];
  });

  return null;
}

/* ── ARKit blend shape indices ───────────────────── */
const ARKIT_INDEX: Record<string, number> = {
  noseSneerRight: 0, noseSneerLeft: 1,
  mouthUpperUpRight: 2, mouthUpperUpLeft: 3,
  mouthSmileRight: 4, mouthSmileLeft: 5,
  mouthShrugUpper: 6, mouthShrugLower: 7,
  mouthRollUpper: 8, mouthRollLower: 9,
  mouthRight: 10, mouthPucker: 11,
  mouthPressRight: 12, mouthPressLeft: 13,
  mouthLowerDownRight: 14, mouthLowerDownLeft: 15,
  mouthLeft: 16, mouthFunnel: 17,
  mouthFrownRight: 18, mouthFrownLeft: 19,
  mouthDimpleRight: 20, mouthDimpleLeft: 21,
  mouthClose: 22,
  jawRight: 23, jawOpen: 24, jawLeft: 25, jawForward: 26,
  headYaw: 27, headPitch: 28,
  eyeWideRight: 29, eyeWideLeft: 30,
  eyeSquintRight: 31, eyeSquintLeft: 32,
  eyeLookUpRight: 33, eyeLookUpLeft: 34,
  eyeLookOutRight: 35, eyeLookOutLeft: 36,
  eyeLookInRight: 37, eyeLookInLeft: 38,
  eyeLookDownRight: 39, eyeLookDownLeft: 40,
  eyeBlinkRight: 41, eyeBlinkLeft: 42,
  cheekSquintRight: 43, cheekSquintLeft: 44, cheekPuff: 45,
  browOuterUpRight: 46, browOuterUpLeft: 47, browInnerUp: 48,
  browDownRight: 49, browDownLeft: 50,
};

type VisemeShapeMap = Partial<Record<keyof typeof ARKIT_INDEX, number>>;

const VISEME_SHAPES: Record<number, VisemeShapeMap> = {
  0:  { mouthClose: 0.2 },
  1:  { jawOpen: 0.7 },
  2:  { jawOpen: 1.0 },
  3:  { jawOpen: 0.7, mouthFunnel: 0.5 },
  4:  { jawOpen: 0.5, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
  5:  { jawOpen: 0.6 },
  6:  { jawOpen: 0.8, mouthFunnel: 0.3 },
  7:  { jawOpen: 0.6, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
  8:  { mouthClose: 0.8, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  9:  { mouthPucker: 0.6, mouthFunnel: 0.3 },
  10: { jawOpen: 0.3, mouthLeft: 0.1, mouthRight: 0.1 },
  11: { jawOpen: 0.1, mouthPressLeft: 0.4, mouthPressRight: 0.4 },
  12: { jawOpen: 0.5 },
  13: { jawOpen: 0.3, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 },
  14: { jawOpen: 0.4 },
  15: { jawOpen: 0.4 },
  16: { jawOpen: 0.4, mouthPucker: 0.3 },
  17: { jawOpen: 0.2 },
  18: { jawOpen: 0.3 },
  19: { jawOpen: 0.4, mouthPucker: 0.4 },
  20: { jawOpen: 0.4, mouthPucker: 0.4 },
  21: { mouthPucker: 0.5, mouthFunnel: 0.2 },
};

interface EmotionShapeMap {
  smileLeft?: number; smileRight?: number;
  browInnerUp?: number;
  browOuterUpLeft?: number; browOuterUpRight?: number;
  browDownLeft?: number;  browDownRight?: number;
  jawOpen?: number;
}

const EMOTION_SHAPES: Record<string, EmotionShapeMap> = {
  friendly:       { smileLeft: 0.4, smileRight: 0.4, browInnerUp: 0.1 },
  concerned:      { browInnerUp: 0.3, browOuterUpLeft: 0.2, browOuterUpRight: 0.2, smileLeft: 0.05, smileRight: 0.05 },
  'formal-polite': { smileLeft: 0.15, smileRight: 0.15 },
  surprised:      { browInnerUp: 0.7, browOuterUpLeft: 0.5, browOuterUpRight: 0.5, jawOpen: 0.3, smileLeft: 0.2, smileRight: 0.2 },
  grateful:       { smileLeft: 0.5, smileRight: 0.5, browInnerUp: 0.1 },
  apologetic:     { browInnerUp: 0.3, browDownLeft: 0.1, browDownRight: 0.1, smileLeft: 0.1, smileRight: 0.1 },
};

function setShapeWeight(mesh: THREE.SkinnedMesh, shapeName: string, weight: number): void {
  const idx = ARKIT_INDEX[shapeName];
  if (idx === undefined) return;
  if (mesh.morphTargetInfluences && idx < mesh.morphTargetInfluences.length) {
    mesh.morphTargetInfluences[idx] = weight;
  }
}

function setEyelashWeight(mesh: THREE.SkinnedMesh, targetIdx: number, weight: number): void {
  if (mesh.morphTargetInfluences && targetIdx < mesh.morphTargetInfluences.length) {
    mesh.morphTargetInfluences[targetIdx] = weight;
  }
}

/* ── RestPoseApplicator ─────────────────────────────────────────────────────
   Runs once after the model loads. Rotates the upper-arm bones downward so
   the avatar stands in a natural relaxed stance instead of the T-pose bind
   position. The GLB bakes its skeleton in T-pose (arms at 90° from body);
   this corrects that to ~30° drop without touching any animation clips.

   Bone name patterns checked (in order of preference):
     1. Exact Mixamo names:  "mixamorig:LeftArm" / "mixamorig:RightArm"
     2. ReadyPlayerMe names: "LeftArm" / "RightArm"
     3. Partial match:        any bone whose name includes "LeftArm" or "RightArm"
   ────────────────────────────────────────────────────────────────────────── */
function RestPoseApplicator({ scene }: { scene: THREE.Group }) {
  useEffect(() => {
    // Traverse all bones and log their names as requested to identify the correct ones
    const boneNames: string[] = [];
    scene.traverse((node) => {
      if (node instanceof THREE.Bone) {
        boneNames.push(node.name);
      }
    });
    console.log('[RestPoseApplicator] Discovering bones:', boneNames);

    const bones: Record<string, THREE.Bone | null> = {
      leftArm: null,
      rightArm: null,
      leftForeArm: null,
      rightForeArm: null,
    };

    scene.traverse((node) => {
      if (!(node instanceof THREE.Bone)) return;
      const n = node.name.toLowerCase();

      // Upper Arm bone matching
      const isLeft = n.includes('left') || n.includes('l_') || n.startsWith('l_') || n.endsWith('_l');
      const isRight = n.includes('right') || n.includes('r_') || n.startsWith('r_') || n.endsWith('_r');

      if (!bones.leftArm && (
        n.includes('mixamorig:leftarm') || 
        n === 'leftarm' || 
        n === 'j_bip_l_upperarm' || 
        (n.includes('upperarm')) ||
        (n.includes('arm') && isLeft && !n.includes('fore'))
      )) {
        bones.leftArm = node as THREE.Bone;
      }
      if (!bones.rightArm && (
        n.includes('mixamorig:rightarm') || 
        n === 'rightarm' || 
        n === 'j_bip_r_upperarm' || 
        (n.includes('upperarm')) ||
        (n.includes('arm') && isRight && !n.includes('fore'))
      )) {
        bones.rightArm = node as THREE.Bone;
      }

      // Forearm bone matching
      if (!bones.leftForeArm && (
        n.includes('mixamorig:leftforearm') ||
        n === 'leftforearm' ||
        n === 'j_bip_l_lowerarm' ||
        n.includes('forearm') ||
        n.includes('lowerarm')
      ) && isLeft) {
        bones.leftForeArm = node as THREE.Bone;
      }
      if (!bones.rightForeArm && (
        n.includes('mixamorig:rightforearm') ||
        n === 'rightforearm' ||
        n === 'j_bip_r_lowerarm' ||
        n.includes('forearm') ||
        n.includes('lowerarm')
      ) && isRight) {
        bones.rightForeArm = node as THREE.Bone;
      }
    });

    const { leftArm, rightArm, leftForeArm, rightForeArm } = bones;

    if (leftArm) leftArm.rotation.z = Math.PI / 5.5;
    if (rightArm) rightArm.rotation.z = -Math.PI / 5.5;
    
    if (leftForeArm) leftForeArm.rotation.z = 0.15;
    if (rightForeArm) rightForeArm.rotation.z = -0.15;

    scene.updateMatrixWorld(true);

    if (!leftArm && !rightArm) {
      console.warn('[RestPoseApplicator] No shoulder bones found — T-pose will persist. Bone names:', boneNames);
    } else {
      console.log('[RestPoseApplicator] Applied rest pose to:', {
        leftArm: leftArm?.name,
        rightArm: rightArm?.name,
        leftForeArm: leftForeArm?.name,
        rightForeArm: rightForeArm?.name
      });
    }
  }, [scene]);

  return null;
}

/* ── MorphTargetController ── */
function MorphTargetController({ fbx, mode, emotion }: { fbx: THREE.Group } & AvatarAnimationProps) {
  const meshes = useMemo(() => {
    const found: THREE.SkinnedMesh[] = [];
    fbx.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.morphTargetDictionary) found.push(child);
    });
    return found;
  }, [fbx]);

  useEffect(() => {
    for (const mesh of meshes) {
      if (mesh.morphTargetDictionary) {
        const keys = Object.keys(mesh.morphTargetDictionary);
        console.log(`[MorphTargetController] ${mesh.name}: ${keys.length} targets`);
      }
    }
  }, [meshes]);

  const timeRef = useRef(0);
  const blinkTimer = useRef(0);
  const nextBlink = useRef(2 + Math.random() * 4);
  const blinkWeight = useRef(0);
  const targetVisemeShapes = useRef<VisemeShapeMap>({});
  const currentVisemeShapes = useRef<VisemeShapeMap>({});
  const prevVisemeId = useRef(-1);

  const targetEmotionShapes = useMemo<EmotionShapeMap>(() => {
    if (emotion && EMOTION_SHAPES[emotion]) return EMOTION_SHAPES[emotion];
    return {};
  }, [emotion]);

  useFrame((_, delta) => {
    timeRef.current += delta;

    const visemeId = mode === 'talking' ? getCurrentViseme() : -1;
    if (visemeId !== prevVisemeId.current && visemeId >= 0) {
      targetVisemeShapes.current = VISEME_SHAPES[visemeId] ?? {};
      prevVisemeId.current = visemeId;
    } else if (visemeId < 0) {
      targetVisemeShapes.current = {};
      prevVisemeId.current = -1;
    }

    const allShapeKeys = new Set([
      ...Object.keys(targetVisemeShapes.current),
      ...Object.keys(targetEmotionShapes),
    ]);

    let currentBlink = blinkWeight.current;
    if (mode === 'idle' || mode === 'listening') {
      blinkTimer.current += delta;
      if (blinkTimer.current >= nextBlink.current) {
        blinkWeight.current = 1;
        blinkTimer.current = 0;
        nextBlink.current = 2 + Math.random() * 5;
      }
    } else {
      blinkWeight.current = 0;
    }
    if (currentBlink > 0) blinkWeight.current = Math.max(0, currentBlink - delta * 6);
    const blink = Math.sin(Math.max(0, Math.min(1, blinkWeight.current)) * Math.PI);

    for (const mesh of meshes) {
      if (!mesh.morphTargetInfluences) continue;
      const isEyelash = mesh.name === 'AvatarEyelashes';
      const isHead = mesh.name === 'AvatarHead';

      if (isHead) {
        for (const key of allShapeKeys) {
          const visemeTarget = targetVisemeShapes.current[key as keyof VisemeShapeMap] ?? 0;
          const emotionTarget = targetEmotionShapes[key as keyof EmotionShapeMap] ?? 0;
          const combined = Math.max(visemeTarget, emotionTarget);
          const current = currentVisemeShapes.current[key as keyof VisemeShapeMap] ?? 0;
          const smoothed = lerp(current, combined, delta * 10);
          (currentVisemeShapes.current as Record<string, number>)[key] = smoothed;
          setShapeWeight(mesh, key, smoothed);
        }
      }

      if (isEyelash) {
        setEyelashWeight(mesh, 7, blink);
        setEyelashWeight(mesh, 8, blink);
        if (targetEmotionShapes.browInnerUp) setEyelashWeight(mesh, 2, targetEmotionShapes.browInnerUp);
        if (targetEmotionShapes.browDownLeft || targetEmotionShapes.browDownRight) {
          const browDown = Math.max(targetEmotionShapes.browDownLeft ?? 0, targetEmotionShapes.browDownRight ?? 0);
          setEyelashWeight(mesh, 0, browDown);
          setEyelashWeight(mesh, 1, browDown);
        }
      }
    }
  });

  return null;
}

/* ── AutoCamera ─────────────────────────────────────────────────────────────
   Frames the camera after the model is grounded.

   FIXED framing logic:
   - Grounds the model so its feet sit at y=0
   - For 'front':          frames the upper 55% of the model (waist-up portrait)
   - For 'over-shoulder':  positions camera behind-right, looking forward and down

   Previous bug: the camera was computing `focusY` as the vertical midpoint of the
   upper 60% of height, but then positioning the camera at exactly `focusY` — which
   put the camera at chest height aiming at its own position (lookAt ≈ camera.y),
   resulting in near-zero vertical angle and showing head at the very top of frame.
   Fix: position camera above the focus point so it aims down at the character's face.
   ────────────────────────────────────────────────────────────────────────── */
function AutoCamera({ scene, cameraMode }: { scene: THREE.Group; cameraMode: 'front' | 'over-shoulder' }) {
  const { camera } = useThree();
  const framed = useRef(false);

  useEffect(() => {
    if (!scene || framed.current) return;

    // Run after RestPoseApplicator (200ms timeout as requested)
    const timer = setTimeout(() => {
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());

      if (size.y < 0.1 || size.y > 100) {
        console.warn('[AutoCamera] Unexpected model size — skipping', size.y);
        return;
      }

      // Ground the model: shift lowest point to y=0
      scene.position.y -= box.min.y;

      const groundedBox = new THREE.Box3().setFromObject(scene);
      const groundedHeight = groundedBox.getSize(new THREE.Vector3()).y;
      const fovRad = (camera as THREE.PerspectiveCamera).fov * Math.PI / 360;

      if (cameraMode === 'over-shoulder') {
        camera.position.set(0.5, groundedHeight * 0.55, groundedHeight * 0.35);
        camera.lookAt(-0.2, groundedHeight * 0.6, -1.5);
      } else {
        // waist-up framing
        const visibleFraction = 0.52;
        const focusY = groundedHeight * 0.82;
        const distance = (groundedHeight * visibleFraction) / (2 * Math.tan(fovRad));
        
        camera.position.set(0.05, focusY + distance * 0.04, distance * 0.95);
        camera.lookAt(0.05, focusY, 0);

        console.log('[AutoCamera] front-mode waist-up', {
          groundedHeight,
          focusY,
          distance,
          cameraPos: camera.position,
        });
      }

      framed.current = true;
    }, 200);

    return () => clearTimeout(timer);
  }, [scene, camera, cameraMode]);

  return null;
}

/* ── AnimatedModel ─────────────────────────────────────────────────────────
   Loads the GLB, applies rest-pose bone correction on load (fixes T-pose),
   then hands off to morph-target OR pose controller.
   ────────────────────────────────────────────────────────────────────────── */
function AnimatedModel({ url, mode, emotion, gesture, cameraMode }: {
  url: string;
  cameraMode?: 'front' | 'over-shoulder';
} & AvatarAnimationProps) {
  const { scene: originalScene } = useGLTF(url);
  const scene = useMemo(() => originalScene.clone(), [originalScene]);
  const [hasMorphs, setHasMorphs] = useState(false);

  useEffect(() => {
    if (scene) setHasMorphs(checkMorphTargets(scene));
  }, [scene]);

  return (
    <group>
      <primitive object={scene} rotation={[0, -0.3, 0]} />
      {/* Ground model and frame camera first */}
      <AutoCamera scene={scene} cameraMode={cameraMode ?? 'front'} />
      {/* Fix T-pose by rotating shoulder bones to natural rest position */}
      <RestPoseApplicator scene={scene} />
      {hasMorphs ? (
        <MorphTargetController fbx={scene} mode={mode} emotion={emotion} gesture={gesture} />
      ) : (
        <PoseController fbx={scene} mode={mode} emotion={emotion} gesture={gesture} />
      )}
    </group>
  );
}

/* ── ThreeScene ─────────────────────────────────── */
function ThreeScene({ modelUrl, mode, emotion, gesture, cameraMode }: {
  modelUrl: string;
  cameraMode?: 'front' | 'over-shoulder';
} & AvatarAnimationProps) {
  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0, 3], fov: 35 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 4, 4]} intensity={0.8} />
        <directionalLight position={[-3, 2, 3]} intensity={0.3} color="#b0d0ff" />
        <directionalLight position={[0, -2, 2]} intensity={0.2} />
        <EmotionLight emotion={emotion} />
        <Suspense fallback={null}>
          <AnimatedModel url={modelUrl} mode={mode} emotion={emotion} gesture={gesture} cameraMode={cameraMode} />
          <Environment preset="studio" />
          {cameraMode !== 'over-shoulder' && (
            <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={3} blur={2} far={4} />
          )}
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
  name, accentColor, mode = 'idle', emotion, gesture, cameraMode,
}: {
  name: string;
  accentColor: string;
  portraitSrc?: string;
  mode?: AvatarMode;
  emotion?: string;
  gesture?: string;
  cameraMode?: 'front' | 'over-shoulder';
}) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

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

  return (
    <ThreeScene
      modelUrl="/avatar.glb"
      mode={mode}
      emotion={emotion}
      gesture={gesture}
      cameraMode={cameraMode}
    />
  );
}
