'use client';

import React, { useEffect, useState, useRef, useMemo, Suspense, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, ContactShadows, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AvatarScale } from './AvatarScale';
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
const CAMERA_MODES = ['front', 'over-shoulder', 'portrait', 'banner'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

export function AutoCamera({ scene, cameraMode, onFramed }: {
  scene: THREE.Group;
  cameraMode: CameraMode;
  onFramed?: () => void;
}) {
  const { camera } = useThree();
  const framed = useRef(false);

  useEffect(() => {
    if (!scene || framed.current) return;

    let rafId: number;
    let attempts = 0;
    const MAX_ATTEMPTS = 60;

    const tryFrame = () => {
      attempts += 1;
      const box = new THREE.Box3().setFromObject(scene);
      const boxSize = box.getSize(new THREE.Vector3());
      const isFinite3 = (v: THREE.Vector3) =>
        Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

      const boxValid = isFinite3(box.min) && isFinite3(box.max) && isFinite3(boxSize)
        && boxSize.y >= 0.1 && boxSize.y <= 100;

      if (!boxValid) {
        if (attempts >= MAX_ATTEMPTS) return;
        rafId = requestAnimationFrame(tryFrame);
        return;
      }

      const groundedHeight = box.getSize(new THREE.Vector3()).y;
      const center = box.getCenter(new THREE.Vector3());
      const fovRad = (camera as THREE.PerspectiveCamera).fov * Math.PI / 360;

      const modeConfig: Record<CameraMode, { visibleFraction: number; focusYOffset: number; sideOffset: number; zOffset: number; lookAtOffsetY: number }> = {
        'over-shoulder': { visibleFraction: 0.28, focusYOffset: 0.48, sideOffset: 0.35, zOffset: -1, lookAtOffsetY: -0.02 },
        front:           { visibleFraction: 0.52, focusYOffset: 0.42, sideOffset: 0.05, zOffset: 0.95, lookAtOffsetY: 0 },
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
      onFramed?.();
    };

    const initialDelay = setTimeout(() => { rafId = requestAnimationFrame(tryFrame); }, 200);

    return () => {
      clearTimeout(initialDelay);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [scene, camera, cameraMode, onFramed]);

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
  idleAnims,
  talkingAnims,
  bowAnims,
  shakeAnims,
}: {
  scene: THREE.Group;
  freezeOnIdle?: boolean;
  onSystemReady?: (system: EmotionSystem) => void;
  idleAnims: THREE.AnimationClip[];
  talkingAnims: THREE.AnimationClip[];
  bowAnims: THREE.AnimationClip[];
  shakeAnims: THREE.AnimationClip[];
} & AvatarAnimationProps) {
  const [initialized, setInitialized] = useState(false);
  const animManagerRef = useRef<AnimationManager | null>(null);
  const expressionRef = useRef<ExpressionEngine | null>(null);
  const lipSyncRef = useRef<LipSync | null>(null);
  const emotionSystemRef = useRef<EmotionSystem | null>(null);
  const groundedOffset = useRef(0);
  const prevModeRef = useRef<AvatarMode>('idle');
  const prevGestureRef = useRef<string>('none');

  const sceneBoneNames = useMemo(() => {
    const names = new Set<string>();
    scene.traverse((child) => { if (child instanceof THREE.Bone) names.add(child.name); });
    return names;
  }, [scene]);

  // Step 1: Once RestPoseApplicator signals, measure height ONCE, apply
  // fixed grounding offset, create mixer + AnimationManager, wire
  // ExpressionEngine + LipSync, then start the idle animation.
  const handleRestPoseApplied = useCallback(() => {
    if (initialized) return;

      AvatarScale.apply(scene);

    groundedOffset.current = scene.position.y;

    const clips = new Map<string, THREE.AnimationClip>();
    if (idleAnims[0]) clips.set('idle', idleAnims[0]);
    if (talkingAnims[0]) clips.set('talking', talkingAnims[0]);
    if (bowAnims[0]) clips.set('bow', bowAnims[0]);
    if (shakeAnims[0]) clips.set('shake_hands', shakeAnims[0]);

    const mixer = new THREE.AnimationMixer(scene);
    const anim = new AnimationManager();
    const ok = anim.init(scene, mixer, clips, sceneBoneNames);
    if (!ok) console.warn('[AnimationSystemHost] No usable animation clips found');

    const expr = new ExpressionEngine(scene);
    const lip = new LipSync(scene);
    lip.expressionEngine = expr;

    const emo = new EmotionSystem({ expression: expr, animation: anim, lipSync: lip });

    animManagerRef.current = anim;
    expressionRef.current = expr;
    lipSyncRef.current = lip;
    emotionSystemRef.current = emo;

    setInitialized(true);
    onSystemReady?.(emo);
  }, [scene, initialized, idleAnims, talkingAnims, bowAnims, shakeAnims, sceneBoneNames, onSystemReady]);

  // Step 2: React to mode/emotion/gesture changes after init
  useEffect(() => {
    if (!initialized) return;
    const emo = emotionSystemRef.current;
    if (!emo) return;

    const normalizedGesture = gesture && ALLOWED_GESTURES.has(gesture) ? gesture : 'none';

    if (mode === 'talking') {
      if (prevModeRef.current !== 'talking') {
        emo.animation.play('talking', { loop: true, fade: 0.7 });
      }
    } else if (mode === 'listening') {
      if (emo.animation.hasClip('listening')) {
        emo.startListening();
      } else if (prevModeRef.current !== 'idle') {
        emo.animation.play('idle', { loop: true, fade: 0.7 });
      }
    } else {
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
        case 'bow':         targetClip = 'bow'; break;
        case 'shake_hands': targetClip = 'shake_hands'; break;
        case 'wave':        targetClip = 'shake_hands'; break;
        case 'nod':         targetClip = 'bow'; break;
      }
      if (targetClip && emo.animation.hasClip(targetClip)) {
        emo.animation.play(targetClip, { loop: false, fade: 0.3 });
      }
    }

    prevModeRef.current = mode;
    prevGestureRef.current = normalizedGesture;
  }, [initialized, mode, emotion, gesture]);

  // Step 3: Re-apply fixed grounding offset after every transition
  useEffect(() => {
    if (!initialized) return;
    scene.position.y = groundedOffset.current;
    scene.updateMatrixWorld(true);
  }, [initialized, mode, gesture]);

  // Freeze on demand
  useEffect(() => {
    if (freezeOnIdle && initialized) {
      animManagerRef.current?.dispose();
    }
  }, [freezeOnIdle, initialized]);

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
   and lip sync.
   ──────────────────────────────────────────────────────────────────── */
export function AnimatedModel({ url, mode, emotion, gesture, cameraMode, cameraIntent, onFramed, disableAutoCamera, freezeOnIdle }: {
  url: string;
  cameraMode?: CameraMode;
  cameraIntent: CameraIntent;
  onFramed?: () => void;
  disableAutoCamera?: boolean;
  freezeOnIdle?: boolean;
} & AvatarAnimationProps) {
  const { scene: originalScene } = useGLTF(url);
  const scene = useMemo(() => cloneSkeleton(originalScene) as THREE.Group, [originalScene]);
  const [clipsLoaded, setClipsLoaded] = useState(false);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
  }, [scene]);

  useEffect(() => {
    useGLTF.preload('/anim_standing Idle.glb');
    useGLTF.preload('/anim_Talking.glb');
    useGLTF.preload('/anim_bow.glb');
    useGLTF.preload('/anim_shaking hands.glb');
    setClipsLoaded(true);
  }, []);

  const computedYaw = yawFromIntent(cameraIntent);

  return (
    <group>
      <primitive object={scene} rotation={[0, computedYaw, 0]} />
      {!disableAutoCamera && (
        <AutoCamera scene={scene} cameraMode={cameraMode ?? 'front'} onFramed={onFramed} />
      )}
      {clipsLoaded ? (
        <AnimationSystemHostInner
          scene={scene}
          mode={mode}
          emotion={emotion}
          gesture={gesture}
          freezeOnIdle={freezeOnIdle}
        />
      ) : (
        <PoseControllerFallback scene={scene} mode={mode} emotion={emotion} gesture={gesture} />
      )}
    </group>
  );
}

/* ── AnimationSystemHostInner ───────────────────────────────────────
   Separate component so useGLTF() for animation clips is not called
   during AnimatedModel's render (prevents useProgress update conflict
   with ModelLoader sibling). Only rendered after preload completes.
   ──────────────────────────────────────────────────────────────────── */
function AnimationSystemHostInner({
  scene,
  mode,
  emotion,
  gesture,
  freezeOnIdle,
}: {
  scene: THREE.Group;
  freezeOnIdle?: boolean;
} & AvatarAnimationProps) {
  const { animations: idleAnims } = useGLTF('/anim_standing Idle.glb');
  const { animations: talkingAnims } = useGLTF('/anim_Talking.glb');
  const { animations: bowAnims } = useGLTF('/anim_bow.glb');
  const { animations: shakeAnims } = useGLTF('/anim_shaking hands.glb');

  return (
    <AnimationSystemHost
      scene={scene}
      mode={mode}
      emotion={emotion}
      gesture={gesture}
      freezeOnIdle={freezeOnIdle}
      idleAnims={idleAnims}
      talkingAnims={talkingAnims}
      bowAnims={bowAnims}
      shakeAnims={shakeAnims}
    />
  );
}

/* ── PoseControllerFallback ──────────────────────────────────────────
   Rendered while animation clips are still loading. Provides subtle
   breathing motion so the avatar isn't frozen stiff. Does NOT apply
   rest pose — that happens in AnimationSystemHost after clips arrive.
   ──────────────────────────────────────────────────────────────────── */
function PoseControllerFallback({ scene }: { scene: THREE.Group } & AvatarAnimationProps) {
  const timeRef = useRef(0);
  const baselineY = useRef<number | null>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (baselineY.current === null) {
      baselineY.current = scene.position.y;
    }
    const sway = Math.sin(timeRef.current * 2) * 0.003;
    scene.position.y = baselineY.current + sway;
  });

  return null;
}
