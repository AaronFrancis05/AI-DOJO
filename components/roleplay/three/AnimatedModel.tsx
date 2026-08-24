'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AvatarScale, AVATAR_SCALE_DEFAULTS } from './AvatarScale';
import { AnimationManager } from './AnimationManager';
import { ExpressionEngine } from './ExpressionEngine';
import { LipSync } from './LipSync';
import { EmotionSystem } from './EmotionSystem';

/* ── Camera intent — explicit contract, no silent fallback ────────── */
export type CameraIntent = 'face-camera' | 'face-partner-left' | 'face-partner-right';

export const FACE_PARTNER_YAW = 0.8;

export function yawFromIntent(intent: CameraIntent): number {
  switch (intent) {
    case 'face-camera':       return 0;
    case 'face-partner-left':  return FACE_PARTNER_YAW;
    case 'face-partner-right': return -FACE_PARTNER_YAW;
  }
}

/* ── Shared types ─────────────────────────────────────────────────── */
export type AvatarMode = 'idle' | 'listening' | 'talking';

export interface AvatarAnimationProps {
  mode: AvatarMode;
  emotion?: string;
  gesture?: string;
}

const ALLOWED_GESTURES = new Set(['bow', 'wave', 'shake_hands', 'nod', 'none']);

/* ── Emotion accent light ────────────────────────────────────────── */
const EMOTION_COLORS: Record<string, string> = {
  friendly:       '#ffd4a0',
  concerned:      '#a0c4ff',
  'formal-polite': '#c8d0e0',
  surprised:      '#ffe066',
  grateful:       '#ffb3b3',
  apologetic:     '#b3b3cc',
};

export function EmotionLight({ emotion }: { emotion?: string }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetColor = useMemo(() => {
    const hex = EMOTION_COLORS[emotion ?? ''] ?? '#ffffff';
    return new THREE.Color(hex);
  }, [emotion]);

  useFrame((_, delta) => {
    try {
      if (lightRef.current) lightRef.current.color.lerp(targetColor, delta * 2);
    } catch (err) {
      console.error('[EmotionLight] frame error:', err);
    }
  });

  return <directionalLight ref={lightRef} position={[-2, 3, 3]} intensity={0.4} />;
}

/* ── Loading progress bar ──────────────────────────────────────────── */
export function ModelLoader() {
  const { progress, active } = useProgress();
  if (!active) return null;
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="h-1 w-32 overflow-hidden rounded-full bg-dojo-border">
          <div
            className="h-full rounded-full bg-dojo-accent transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </Html>
  );
}

export function SceneLoadingFallback() {
  return (
    <Html center>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-dojo-accent border-t-transparent" />
    </Html>
  );
}

/* ── Dev warnings (reactive) ──────────────────────────────────────── */
let devWarnings: string[] = [];
const warningSubs = new Set<() => void>();

export function logDevWarning(msg: string) {
  if (!devWarnings.includes(msg)) {
    devWarnings.push(msg);
    console.warn('[AvatarViewport]', msg);
    warningSubs.forEach(fn => fn());
  }
}

export function clearDevWarnings() {
  devWarnings = [];
}

export function getDevWarnings(): string[] {
  return [...devWarnings];
}

export function subscribeWarnings(fn: () => void): () => void {
  warningSubs.add(fn);
  return () => { warningSubs.delete(fn); };
}

/* ── RestPoseApplicator ──────────────────────────────────────────────
   Rotates arm bones to a natural relaxed rest position (fixes T-pose).
   Runs BEFORE the animation mixer takes over so the initial pose is
   correct. Must settle before AvatarScale measures the model height.
   ──────────────────────────────────────────────────────────────────── */
function RestPoseApplicator({ scene, onApplied }: { scene: THREE.Group; onApplied?: () => void }) {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;

    const boneNames: string[] = [];
    const allBones: THREE.Bone[] = [];

    scene.traverse((node) => {
      if (node instanceof THREE.Bone) {
        boneNames.push(node.name);
        allBones.push(node);
      }
    });

    const leftArm = allBones.find(b => b.name === 'LeftArm');
    const rightArm = allBones.find(b => b.name === 'RightArm');
    const leftForeArm = allBones.find(b => b.name === 'LeftForeArm');
    const rightForeArm = allBones.find(b => b.name === 'RightForeArm');

    let fallbackLeftArm: THREE.Bone | undefined;
    let fallbackRightArm: THREE.Bone | undefined;
    let fallbackLeftForeArm: THREE.Bone | undefined;
    let fallbackRightForeArm: THREE.Bone | undefined;

    if (!leftArm || !rightArm) {
      for (const b of allBones) {
        const n = b.name.toLowerCase();
        const isLeft = n.includes('left') || n.includes('l_');
        const isRight = n.includes('right') || n.includes('r_');

        if (!fallbackLeftArm && !leftArm && (
          n.includes('mixamorig:leftarm') ||
          n === 'leftarm' ||
          n === 'j_bip_l_upperarm' ||
          (n.includes('arm') && isLeft && !n.includes('fore'))
        )) {
          fallbackLeftArm = b;
        }
        if (!fallbackRightArm && !rightArm && (
          n.includes('mixamorig:rightarm') ||
          n === 'rightarm' ||
          n === 'j_bip_r_upperarm' ||
          (n.includes('arm') && isRight && !n.includes('fore'))
        )) {
          fallbackRightArm = b;
        }
        if (!fallbackLeftForeArm && !leftForeArm && (
          n.includes('mixamorig:leftforearm') ||
          n === 'leftforearm' ||
          n === 'j_bip_l_lowerarm' ||
          (n.includes('forearm') && isLeft) ||
          (n.includes('lowerarm') && isLeft)
        )) {
          fallbackLeftForeArm = b;
        }
        if (!fallbackRightForeArm && !rightForeArm && (
          n.includes('mixamorig:rightforearm') ||
          n === 'rightforearm' ||
          n === 'j_bip_r_lowerarm' ||
          (n.includes('forearm') && isRight) ||
          (n.includes('lowerarm') && isRight)
        )) {
          fallbackRightForeArm = b;
        }
      }
    }

    const finalLeftArm = leftArm ?? fallbackLeftArm;
    const finalRightArm = rightArm ?? fallbackRightArm;
    const finalLeftForeArm = leftForeArm ?? fallbackLeftForeArm;
    const finalRightForeArm = rightForeArm ?? fallbackRightForeArm;

    const armDrop = Math.PI / 2.3;
    if (finalLeftArm) finalLeftArm.rotation.z = armDrop;
    if (finalRightArm) finalRightArm.rotation.z = -armDrop;
    if (finalLeftForeArm) finalLeftForeArm.rotation.z = 0.35;
    if (finalRightForeArm) finalRightForeArm.rotation.z = -0.35;

    scene.updateMatrixWorld(true);

    applied.current = true;
    onApplied?.();
  }, [scene, onApplied]);

  return null;
}

/* ── AutoCamera ──────────────────────────────────────────────────────
   Frames the camera after the model is grounded.
   ──────────────────────────────────────────────────────────────────── */
export type CameraMode = 'front' | 'over-shoulder' | 'portrait' | 'banner';

export function AutoCamera({ scene, cameraMode, onFramed, groundedVersion }: {
  scene: THREE.Group;
  cameraMode: CameraMode;
  onFramed?: () => void;
  groundedVersion?: number;
}) {
  const { camera } = useThree();
  const framed = useRef(false);
  const lastSeenGrounding = useRef(0);

  useEffect(() => {
    if (groundedVersion !== undefined && groundedVersion > 0 && lastSeenGrounding.current === 0) {
      lastSeenGrounding.current = groundedVersion;
    }

    if (framed.current && groundedVersion !== undefined && groundedVersion > lastSeenGrounding.current) {
      lastSeenGrounding.current = groundedVersion;
      framed.current = false;
    }

    if (!scene || framed.current) return;

    let rafId: number;
    let attempts = 0;
    const MAX_ATTEMPTS = 120;

    const tryFrame = () => {
      attempts += 1;
      const box = new THREE.Box3().setFromObject(scene);
      const boxSize = box.getSize(new THREE.Vector3());
      const isFinite3 = (v: THREE.Vector3) =>
        Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

      const boxValid = isFinite3(box.min) && isFinite3(box.max) && isFinite3(boxSize)
        && boxSize.y >= 0.1 && boxSize.y <= 100;

      const groundedViaVersion = (groundedVersion ?? 0) > 0;
      const groundedViaUserData = !!(scene.userData as Record<string, unknown>).avatarScale;
      const isGrounded = groundedViaVersion || groundedViaUserData;

      if (!boxValid || !isGrounded) {
        if (attempts >= MAX_ATTEMPTS) return;
        rafId = requestAnimationFrame(tryFrame);
        return;
      }

      const groundedHeight = box.getSize(new THREE.Vector3()).y;
      const center = box.getCenter(new THREE.Vector3());
      const fovRad = (camera as THREE.PerspectiveCamera).fov * Math.PI / 360;

      const modeConfig: Record<CameraMode, { visibleFraction: number; focusYOffset: number; sideOffset: number; zOffset: number; lookAtOffsetY: number }> = {
        'over-shoulder': { visibleFraction: 0.28, focusYOffset: 0.48, sideOffset: 0.35, zOffset: -1, lookAtOffsetY: -0.02 },
        front:           { visibleFraction: 0.85, focusYOffset: 0.38, sideOffset: 0.05, zOffset: 0.80, lookAtOffsetY: -0.05 },
        portrait:        { visibleFraction: 0.20, focusYOffset: 0.52, sideOffset: 0.05, zOffset: 0.95, lookAtOffsetY: 0 },
        banner:          { visibleFraction: 0.40, focusYOffset: 0.44, sideOffset: 0.05, zOffset: 0.95, lookAtOffsetY: 0 },
      };
      const cfg = modeConfig[cameraMode] ?? modeConfig.front;
      const focusY = center.y + groundedHeight * cfg.focusYOffset;
      const distance = (groundedHeight * cfg.visibleFraction) / (2 * Math.tan(fovRad));
      camera.position.set(center.x + cfg.sideOffset, focusY + distance * 0.04, center.z + distance * cfg.zOffset);
      camera.lookAt(center.x, focusY + distance * cfg.lookAtOffsetY, center.z);
      if (cameraMode === 'over-shoulder') {
        camera.lookAt(center.x - 0.05, focusY - distance * 0.02, center.z + distance * 2);
      }

      framed.current = true;
      lastSeenGrounding.current = groundedVersion || 1;
      onFramed?.();
    };

    const initialDelay = setTimeout(() => { rafId = requestAnimationFrame(tryFrame); }, 200);

    return () => {
      clearTimeout(initialDelay);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [scene, camera, cameraMode, onFramed, groundedVersion]);

  return null;
}

/* ── AnimationSystemHost ─────────────────────────────────────────────
   Initializes and manages the avatar animation system: AvatarScale
   (deterministic grounding), AnimationManager (single-action crossfade),
   ExpressionEngine (morph-target emotions + blink + mouth-ducking),
   LipSync (Web Audio visemes), and EmotionSystem (orchestrator).
   Replaces the old GroundModel, AnimationController, PoseController,
   JawBoneController, and MorphTargetController.
   ──────────────────────────────────────────────────────────────────── */
function AnimationSystemHost({
  scene,
  mode,
  emotion,
  gesture,
  freezeOnIdle,
  onSystemReady,
  onGrounded,
}: {
  scene: THREE.Group;
  freezeOnIdle?: boolean;
  onSystemReady?: (system: EmotionSystem) => void;
  onGrounded?: () => void;
} & AvatarAnimationProps) {
  const [initialized, setInitialized] = useState(false);
  const animManagerRef = useRef<AnimationManager | null>(null);
  const expressionRef = useRef<ExpressionEngine | null>(null);
  const lipSyncRef = useRef<LipSync | null>(null);
  const emotionSystemRef = useRef<EmotionSystem | null>(null);
  const prevModeRef = useRef<AvatarMode>('idle');
  const prevGestureRef = useRef<string>('none');
  const prevFreezeRef = useRef(false);

  const sceneBoneNames = useMemo(() => {
    const names = new Set<string>();
    scene.traverse((child) => { if (child instanceof THREE.Bone) names.add(child.name); });
    return names;
  }, [scene]);

  const initAnimSystem = useCallback(async () => {
    const mixer = new THREE.AnimationMixer(scene);
    const anim = new AnimationManager();
    const ok = await anim.init(scene, mixer, null, sceneBoneNames);
    if (!ok) console.warn('[AnimationSystemHost] No usable animation clips found');

    const expr = new ExpressionEngine(scene);
    const lip = new LipSync(scene);
    lip.expressionEngine = expr;

    const emo = new EmotionSystem({ expression: expr, animation: anim, lipSync: lip });

    animManagerRef.current = anim;
    expressionRef.current = expr;
    lipSyncRef.current = lip;
    emotionSystemRef.current = emo;

    return emo;
  }, [scene, sceneBoneNames]);

  const handleRestPoseApplied = useCallback(async () => {
    if (initialized) return;

    AvatarScale.apply(scene);

    const emo = await initAnimSystem();
    emo.animation.play('idle', { loop: true, fade: 0 });
    setInitialized(true);
    onSystemReady?.(emo);
    onGrounded?.();
  }, [scene, initialized, onSystemReady, onGrounded, initAnimSystem]);

  useEffect(() => {
    if (!initialized) return;
    const emo = emotionSystemRef.current;
    if (!emo) return;

    const normalizedGesture = gesture && ALLOWED_GESTURES.has(gesture) ? gesture : 'none';

    if (mode === 'talking') {
      // Keep the flag in sync with the mode, not just with LipSync's own
      // audio: a one-shot gesture fired mid-utterance returns to whatever
      // isTalking says, and a stale `false` dropped the character into idle
      // while the reply was still being spoken.
      emo.animation.isTalking = true;
      if (prevModeRef.current !== 'talking') {
        emo.animation.play('talk', { loop: true, fade: 0.7 });
      }
    } else if (mode === 'listening') {
      emo.animation.isTalking = false;
      if (emo.animation.hasClip('listening')) {
        emo.startListening();
      } else if (prevModeRef.current !== 'idle') {
        emo.animation.play('idle', { loop: true, fade: 0.7 });
      }
    } else {
      emo.animation.isTalking = false;
      if (prevModeRef.current !== 'idle' && prevGestureRef.current === 'none') {
        emo.animation.play('idle', { loop: true, fade: 0.7 });
      } else if (prevGestureRef.current !== 'none' && normalizedGesture === 'none') {
        emo.animation.play('idle', { loop: true, fade: 0.7 });
      }
    }

    if (emotion) {
      emo.expression.setExpression(emotion);
    }

    if (normalizedGesture !== 'none' && normalizedGesture !== prevGestureRef.current) {
      let targetClip = '';
      switch (normalizedGesture) {
        case 'bow':         targetClip = 'greeting'; break;
        case 'shake_hands': targetClip = 'thankful'; break;
        case 'wave':        targetClip = 'greeting'; break;
        case 'nod':         targetClip = 'nod'; break;
      }
      if (targetClip && emo.animation.hasClip(targetClip)) {
        emo.animation.play(targetClip, { loop: false, fade: 0.3 });
      }
    }

    prevModeRef.current = mode;
    prevGestureRef.current = normalizedGesture;
  }, [initialized, mode, emotion, gesture]);

  useEffect(() => {
    if (!initialized) return;
    const meta = (scene.userData as Record<string, unknown>).avatarScale as Record<string, number> | undefined;
    // eslint-disable-next-line react-hooks/immutability -- scene is an imperative THREE.Object3D, not React state
    scene.position.y = meta?.verticalOffset ?? AVATAR_SCALE_DEFAULTS.verticalOffset;
    scene.updateMatrixWorld(true);
  }, [initialized, mode, gesture, scene]);

  // Freezing used to dispose the AnimationManager outright, so unfreezing had
  // to re-run init() — re-fetching and re-parsing every clip in the manifest.
  // Pausing the mixer keeps the loaded actions intact and resumes instantly.
  useEffect(() => {
    if (!initialized) return;
    // Never freeze a character that is speaking — pausing the mixer mid-
    // utterance leaves it standing perfectly still while its audio plays.
    const shouldPause = !!freezeOnIdle && mode !== 'talking';
    animManagerRef.current?.setPaused(shouldPause);
    prevFreezeRef.current = shouldPause;
  }, [freezeOnIdle, initialized, mode]);

  useFrame((_, delta) => {
    if (!initialized) return;
    animManagerRef.current?.update(delta);
    expressionRef.current?.update(delta);
    lipSyncRef.current?.update(delta);
  });

  return <RestPoseApplicator scene={scene} onApplied={handleRestPoseApplied} />;
}

/* ── AnimatedModel ───────────────────────────────────────────────────
   Loads the GLB, applies rest-pose bone correction, deterministic
   grounding, single-action animation manager, expression engine,
   and lip sync. Animation clips load asynchronously from the FBX
   manifest in AnimationManager during init().
   ──────────────────────────────────────────────────────────────────── */
export function AnimatedModel({ url, mode, emotion, gesture, cameraMode, cameraIntent, onFramed, disableAutoCamera, freezeOnIdle, onSystemReady }: {
  url: string;
  cameraMode?: CameraMode;
  cameraIntent: CameraIntent;
  onFramed?: () => void;
  disableAutoCamera?: boolean;
  freezeOnIdle?: boolean;
  onSystemReady?: (system: EmotionSystem) => void;
} & AvatarAnimationProps) {
  const { scene: originalScene } = useGLTF(url);
  const scene = useMemo(() => cloneSkeleton(originalScene) as THREE.Group, [originalScene]);
  const [groundedVersion, setGroundedVersion] = useState(0);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
  }, [scene]);

  const handleGrounded = useCallback(() => {
    setGroundedVersion(v => v + 1);
  }, []);

  const computedYaw = yawFromIntent(cameraIntent);

  return (
    <group>
      <primitive object={scene} rotation={[0, computedYaw, 0]} />
      {!disableAutoCamera && (
        <AutoCamera scene={scene} cameraMode={cameraMode ?? 'front'} onFramed={onFramed} groundedVersion={groundedVersion} />
      )}
      <AnimationSystemHost
        scene={scene}
        mode={mode}
        emotion={emotion}
        gesture={gesture}
        freezeOnIdle={freezeOnIdle}
        onGrounded={handleGrounded}
        onSystemReady={onSystemReady}
      />
    </group>
  );
}


