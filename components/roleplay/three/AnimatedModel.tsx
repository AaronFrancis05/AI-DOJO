'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
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

/* ── applyRestPose ───────────────────────────────────────────────────
   Rotates arm bones to a natural relaxed rest position (fixes T-pose).
   Runs synchronously on the freshly cloned scene, BEFORE React mounts it
   and before AvatarScale measures the model height — doing this in an
   effect meant the first painted frames showed the raw GLB: arms out,
   unscaled, floating at whatever height it was authored at.
   ──────────────────────────────────────────────────────────────────── */
export function applyRestPose(scene: THREE.Group): void {
  const allBones: THREE.Bone[] = [];

  scene.traverse((node) => {
    if (node instanceof THREE.Bone) allBones.push(node);
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

    // The model is scaled and grounded before it is ever mounted, so the box
    // is measurable on the first frame — the fixed delay this used to wait out
    // was pure latency in front of the reveal.
    rafId = requestAnimationFrame(tryFrame);

    return () => {
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
  onReady,
}: {
  scene: THREE.Group;
  freezeOnIdle?: boolean;
  onSystemReady?: (system: EmotionSystem) => void;
  onGrounded?: () => void;
  onReady?: () => void;
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

  // Held in refs so a caller passing inline arrows — as the session page does
  // — can't retrigger the whole initialization on every parent render.
  const onSystemReadyRef = useRef(onSystemReady);
  const onGroundedRef = useRef(onGrounded);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onSystemReadyRef.current = onSystemReady; }, [onSystemReady]);
  useEffect(() => { onGroundedRef.current = onGrounded; }, [onGrounded]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const initAnimSystem = useCallback(async () => {
    const mixer = new THREE.AnimationMixer(scene);
    const anim = new AnimationManager();
    // Resolves as soon as the idle clip is registered; the rest of the
    // manifest keeps streaming in behind this.
    const ok = await anim.init(scene, mixer, null, sceneBoneNames);
    if (!ok) console.warn('[AnimationSystemHost] No usable animation clips found');

    const expr = new ExpressionEngine(scene);
    const lip = new LipSync(scene);
    lip.expressionEngine = expr;

    const emo = new EmotionSystem({ expression: expr, animation: anim, lipSync: lip });

    return { emo, anim, expr, lip };
  }, [scene, sceneBoneNames]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { emo, anim, expr, lip } = await initAnimSystem();
      // A remount (or a model swap) while clips were in flight: this system
      // belongs to a scene nobody is showing any more.
      if (cancelled) {
        anim.dispose();
        return;
      }

      animManagerRef.current = anim;
      expressionRef.current = expr;
      lipSyncRef.current = lip;
      emotionSystemRef.current = emo;

      emo.animation.play('idle', { loop: true, fade: 0 });
      setInitialized(true);
      onSystemReadyRef.current?.(emo);
      onGroundedRef.current?.();
      onReadyRef.current?.();
    })();

    return () => {
      cancelled = true;
      lipSyncRef.current?.stop();
      animManagerRef.current?.dispose();
      animManagerRef.current = null;
      emotionSystemRef.current = null;
      setInitialized(false);
    };
  }, [initAnimSystem]);

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
      if (emo.animation.canPlay('listening')) {
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
      // The gesture names ARE clip keys (via ANIMATION_ALIASES and, for a
      // clip whose file isn't on disk yet, CLIP_FALLBACKS) — the switch that
      // used to repeat that mapping here disagreed with AnimationManager the
      // moment either side changed.
      emo.playGesture(normalizedGesture);
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

  return null;
}

/** Reveal the model even if the idle clip never arrives, rather than leaving
 *  the stage permanently empty on a failed or hanging clip request. */
const REVEAL_TIMEOUT_MS = 2500;

/* ── AnimatedModel ───────────────────────────────────────────────────
   Loads the GLB, applies rest-pose bone correction and deterministic
   grounding up front, then hands the model to the animation manager,
   expression engine and lip sync. The model stays hidden until the idle
   clip is actually running: the pose/scale/framing pass takes a few
   frames, and showing it beforehand is what put an unscaled, hands-up
   mannequin on screen at the start of every session.
   ──────────────────────────────────────────────────────────────────── */
export function AnimatedModel({ url, mode, emotion, gesture, cameraMode, cameraIntent, onFramed, disableAutoCamera, freezeOnIdle, onSystemReady, onReady }: {
  url: string;
  cameraMode?: CameraMode;
  cameraIntent: CameraIntent;
  onFramed?: () => void;
  disableAutoCamera?: boolean;
  freezeOnIdle?: boolean;
  onSystemReady?: (system: EmotionSystem) => void;
  onReady?: () => void;
} & AvatarAnimationProps) {
  const { scene: originalScene } = useGLTF(url);
  const scene = useMemo(() => {
    const cloned = cloneSkeleton(originalScene) as THREE.Group;
    // Both run before the clone is ever handed to React, so the very first
    // rendered frame is an arms-down character standing at the right height.
    applyRestPose(cloned);
    AvatarScale.apply(cloned);
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
    return cloned;
  }, [originalScene]);
  const [groundedVersion, setGroundedVersion] = useState(0);
  const [ready, setReady] = useState(false);

  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const handleGrounded = useCallback(() => {
    setGroundedVersion(v => v + 1);
  }, []);

  const revealedRef = useRef(false);
  const handleReady = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setReady(true);
    onReadyRef.current?.();
  }, []);

  // Safety net only: a clip request that fails or hangs must not leave the
  // stage permanently empty. The rest pose and grounding are already applied,
  // so the worst case is a character standing still rather than a broken one.
  useEffect(() => {
    const timer = setTimeout(handleReady, REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [handleReady]);

  const computedYaw = yawFromIntent(cameraIntent);
  // Grounding puts the model's slight forward tilt in rotation.x, but R3F owns
  // this prop — carrying the tilt here keeps it from being flattened on mount.
  const restTiltX = AVATAR_SCALE_DEFAULTS.forwardTiltX;

  return (
    <group>
      <primitive object={scene} rotation={[restTiltX, computedYaw, 0]} visible={ready} />
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
        onReady={handleReady}
      />
    </group>
  );
}


