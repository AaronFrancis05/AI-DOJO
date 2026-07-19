'use client';

import React, { useEffect, useState, useRef, useMemo, Suspense, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, ContactShadows, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getCurrentViseme } from '@/lib/roleplay/tts';

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

type GestureClip = 'bow' | 'shake_hands' | 'nod' | 'none';
type LoopClip = 'idle' | 'talking';
type AnimClip = LoopClip | GestureClip;

const ALLOWED_GESTURES = new Set(['bow', 'wave', 'shake_hands', 'nod', 'none']);

/* ── Emotion pose definitions (fallback PoseController) ──────────── */
const EMOTION_POSES: Record<string, [number, number, number, number]> = {
  friendly:       [0.02, 0.05, 0, 0],
  concerned:      [0.04, -0.02, 0.02, 0],
  'formal-polite': [0, 0, -0.01, 0],
  surprised:      [0.08, 0, -0.03, 0],
  grateful:       [0.03, 0.06, -0.02, 0],
  apologetic:     [0.06, 0, 0.04, 0],
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

/* ── Dev warnings ─────────────────────────────────────────────────── */
let devWarnings: string[] = [];
export function logDevWarning(msg: string) {
  if (!devWarnings.includes(msg)) {
    devWarnings.push(msg);
    console.warn('[AvatarViewport]', msg);
  }
}

export function clearDevWarnings() {
  devWarnings = [];
}

export function getDevWarnings(): string[] {
  return [...devWarnings];
}

/* ── AnimationController ────────────────────────────────────────────
   Loads animation clips from separate GLB files,
   manages crossfade state machine driven by mode + gesture.
   Idle clip is damped to ~35 % weight for subtle breathing-scale motion. ── */
function AnimationController({ scene, mode, emotion, gesture }: { scene: THREE.Group } & AvatarAnimationProps) {
  const { animations: idleAnims } = useGLTF('/anim_standing Idle.glb');
  const { animations: talkingAnims } = useGLTF('/anim_Talking.glb');
  const { animations: bowAnims } = useGLTF('/anim_bow.glb');
  const { animations: shakeAnims } = useGLTF('/anim_shaking hands.glb');

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentState = useRef<AnimClip>('idle');
  const prevModeRef = useRef<AvatarMode>('idle');
  const gestureRef = useRef<string>('none');
  const returnScheduled = useRef(false);
  const hasGesturesRef = useRef(false);
  const clipActions = useRef<Map<AnimClip, { clip: THREE.AnimationClip; action: THREE.AnimationAction | null }>>(new Map());

  const sceneBoneNames = useMemo(() => {
    const names = new Set<string>();
    scene.traverse((child) => { if (child instanceof THREE.Bone) names.add(child.name); });
    return names;
  }, [scene]);

  const STRIP_LOOSE_CLIPS = new Set<AnimClip>(['idle', 'talking']);

  const filterTracks = useCallback((clip: THREE.AnimationClip, clipName: AnimClip): THREE.AnimationClip => {
    const bodyTracks = clip.tracks.filter(t => {
      if (t.name.endsWith('.weights')) return false;
      const [boneName, prop] = t.name.split('.');
      if (!boneName) return true;
      if (prop === 'position' && /hips|root/i.test(boneName)) return false;
      if (!sceneBoneNames.has(boneName)) return false;
      if (!STRIP_LOOSE_CLIPS.has(clipName)) return true;
      if (/head|neck/i.test(boneName)) return false;
      if (prop === 'position') return false;
      return true;
    });
    if (bodyTracks.length === clip.tracks.length) return clip;
    const stripped = clip.tracks.length - bodyTracks.length;
    console.log(`[AnimationController] Stripped ${stripped} tracks from "${clipName}" (head/neck + position)`);
    return new THREE.AnimationClip(clip.name, clip.duration, bodyTracks);
  }, [sceneBoneNames]);

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;

    const rawClips: [AnimClip, THREE.AnimationClip | undefined][] = [
      ['idle', idleAnims[0]],
      ['talking', talkingAnims[0]],
      ['bow', bowAnims[0]],
      ['shake_hands', shakeAnims[0]],
    ];

    for (const [name, clip] of rawClips) {
      if (!clip) {
        console.warn(`[AnimationController] No clip for "${name}"`);
        continue;
      }
      const cleanClip = filterTracks(clip, name);
      const action = mixer.clipAction(cleanClip);
      clipActions.current.set(name, { clip: cleanClip, action });
    }

    const hasAny = clipActions.current.size > 0;
    hasGesturesRef.current = hasAny;
    if (!hasAny) {
      logDevWarning('No animation clips loaded — body animation disabled');
    } else {
      const idleEntry = clipActions.current.get('idle');
      if (idleEntry?.action) {
        idleEntry.action.reset();
        idleEntry.action.setLoop(THREE.LoopRepeat, Infinity);
        // Dampen idle to ~35 % for subtle breathing-scale motion
        idleEntry.action.weight = 0.35;
        idleEntry.action.play();
      }
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [scene, idleAnims, talkingAnims, bowAnims, shakeAnims]);

  const getAction = useCallback((name: AnimClip): THREE.AnimationAction | null => {
    return clipActions.current.get(name)?.action ?? null;
  }, []);

  const playClip = useCallback((name: AnimClip, fadeDuration = 0.3) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const prevEntry = clipActions.current.get(currentState.current);
    const nextEntry = clipActions.current.get(name);
    if (!nextEntry) return;

    if (currentState.current === name && nextEntry.action?.isRunning()) return;

    const isLoop = name === 'idle' || name === 'talking';
    const nextAction = nextEntry.action!;
    nextAction.reset();
    nextAction.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, isLoop ? Infinity : 1);
    nextAction.clampWhenFinished = !isLoop;
    // Keep damped weight for idle
    if (name === 'idle') nextAction.weight = 0.35;
    if (name === 'talking') nextAction.weight = 0.7;

    const prevAction = prevEntry?.action;
    if (prevAction && prevAction !== nextAction && prevAction.isRunning()) {
      nextAction.crossFadeFrom(prevAction, fadeDuration, true);
    }

    nextAction.play();
    currentState.current = name;

    if (!isLoop) {
      const clip = nextEntry.clip;
      const returnAt = Math.max(0, (clip.duration * 1000) - fadeDuration * 1000 - 50);
      returnScheduled.current = false;
      setTimeout(() => {
        if (returnScheduled.current) return;
        returnScheduled.current = true;
        const backTo: AnimClip = prevModeRef.current === 'talking' ? 'talking' : 'idle';
        const backAction = getAction(backTo);
        if (backAction) {
          backAction.reset();
          backAction.setLoop(THREE.LoopRepeat, Infinity);
          if (backTo === 'idle') backAction.weight = 0.35;
          const currentAct = clipActions.current.get(currentState.current)?.action;
          if (currentAct && currentAct.isRunning()) {
            backAction.crossFadeFrom(currentAct, fadeDuration, true);
          }
          backAction.play();
          currentState.current = backTo;
        }
      }, returnAt);
    }
  }, [getAction]);

  useEffect(() => {
    if (mode === 'talking' && currentState.current === 'idle') {
      playClip('talking', 0.35);
    } else if (mode !== 'talking' && currentState.current === 'talking') {
      playClip('idle', 0.35);
    }
    prevModeRef.current = mode;
  }, [mode, playClip]);

  const normalizedGesture = gesture && ALLOWED_GESTURES.has(gesture) ? gesture : 'none';
  useEffect(() => {
    if (normalizedGesture !== 'none' && normalizedGesture !== gestureRef.current) {
      gestureRef.current = normalizedGesture;
      let targetClip: AnimClip = 'bow';
      switch (normalizedGesture) {
        case 'bow':          targetClip = 'bow'; break;
        case 'shake_hands':  targetClip = 'shake_hands'; break;
        case 'wave':         targetClip = 'shake_hands'; break;
        case 'nod':          targetClip = 'bow'; break;
      }
      if (clipActions.current.has(targetClip)) {
        playClip(targetClip, 0.3);
      }
    }
  }, [normalizedGesture, playClip]);

  useFrame((_, delta) => {
    try {
      mixerRef.current?.update(delta);
    } catch (err) {
      console.error('[AnimationController] frame error:', err);
    }
  });

  return null;
}

/* ── PoseController — fallback for models with NO usable clips ── */
function PoseController({ fbx, mode, emotion, gesture }: { fbx: THREE.Group } & AvatarAnimationProps) {
  const timeRef = useRef(0);
  const currentPose = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  useFrame((_, delta) => {
    try {
      timeRef.current += delta;

      const basePose: [number, number, number, number] = [0, 0, 0, 0];
      if (emotion && EMOTION_POSES[emotion]) {
        const p = EMOTION_POSES[emotion];
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
      fbx.position.y = currentPose.current[2];
    } catch (err) {
      console.error('[PoseController] frame error:', err);
    }
  });

  return null;
}

/* ── ARKit blend shape indices ────────────────────────────────────── */
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
  0:  { mouthClose: 1.0 },
  1:  { jawOpen: 0.6, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
  2:  { jawOpen: 0.7, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
  3:  { mouthClose: 0.8, mouthPressLeft: 0.3, mouthPressRight: 0.3 },
  4:  { jawOpen: 0.3, mouthPucker: 0.4, mouthFunnel: 0.3 },
  5:  { jawOpen: 0.3, mouthPressLeft: 0.4, mouthPressRight: 0.4 },
  6:  { jawOpen: 0.4, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
  7:  { jawOpen: 0.3, mouthPucker: 0.2 },
  8:  { mouthClose: 0.5, mouthPressLeft: 0.3, mouthPressRight: 0.3 },
  9:  { jawOpen: 0.5 },
  10: { jawOpen: 0.3, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 },
  11: { jawOpen: 0.3, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
  12: { jawOpen: 0.2, mouthLeft: 0.2, mouthRight: 0.2 },
  13: { jawOpen: 0.5, mouthFunnel: 0.7 },
  14: { mouthPucker: 0.5 },
  15: { mouthClose: 0.3, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 },
  16: { jawOpen: 0.3, mouthPucker: 0.6, mouthFunnel: 0.5 },
  17: { mouthPucker: 0.6, mouthFunnel: 0.5 },
  18: { mouthClose: 0.8 },
  19: {},
  20: { jawOpen: 0.5, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
  21: { mouthPucker: 0.5, mouthFunnel: 0.3 },
};

const MISSING_SHAPE_WARNED = new Set<string>();

interface EmotionShapeMap {
  mouthSmileLeft?: number; mouthSmileRight?: number;
  browInnerUp?: number;
  browOuterUpLeft?: number; browOuterUpRight?: number;
  browDownLeft?: number;  browDownRight?: number;
  jawOpen?: number;
}

const EMOTION_SHAPES: Record<string, EmotionShapeMap> = {
  friendly:       { mouthSmileLeft: 0.4, mouthSmileRight: 0.4, browInnerUp: 0.1 },
  concerned:      { browInnerUp: 0.3, browOuterUpLeft: 0.2, browOuterUpRight: 0.2, mouthSmileLeft: 0.05, mouthSmileRight: 0.05 },
  'formal-polite': { mouthSmileLeft: 0.15, mouthSmileRight: 0.15 },
  surprised:      { browInnerUp: 0.7, browOuterUpLeft: 0.5, browOuterUpRight: 0.5, jawOpen: 0.3, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 },
  grateful:       { mouthSmileLeft: 0.5, mouthSmileRight: 0.5, browInnerUp: 0.1 },
  apologetic:     { browInnerUp: 0.3, browDownLeft: 0.1, browDownRight: 0.1, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
};

function resolveMorphIndex(mesh: THREE.SkinnedMesh, shapeName: string): number | undefined {
  if (mesh.morphTargetDictionary && mesh.morphTargetDictionary[shapeName] !== undefined) {
    return mesh.morphTargetDictionary[shapeName];
  }
  const idx = ARKIT_INDEX[shapeName];
  if (idx === undefined) {
    if (!MISSING_SHAPE_WARNED.has(shapeName)) {
      MISSING_SHAPE_WARNED.add(shapeName);
      logDevWarning(`Morph shape "${shapeName}" not found in model's dictionary or ARKIT table`);
    }
    return undefined;
  }
  return idx;
}

function setShapeWeight(mesh: THREE.SkinnedMesh, shapeName: string, weight: number): void {
  const idx = resolveMorphIndex(mesh, shapeName);
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
   Rotates arm bones to a natural relaxed rest position (fixes T-pose).
   ────────────────────────────────────────────────────────────────────────── */
function RestPoseApplicator({ scene }: { scene: THREE.Group }) {
  useEffect(() => {
    const boneNames: string[] = [];
    const allBones: THREE.Bone[] = [];

    scene.traverse((node) => {
      if (node instanceof THREE.Bone) {
        boneNames.push(node.name);
        allBones.push(node);
      }
    });

    console.log('[RestPoseApplicator] Discovering bones:', boneNames);

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

    if (finalLeftArm) {
      const worldQuat = new THREE.Quaternion();
      finalLeftArm.getWorldQuaternion(worldQuat);
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(worldQuat);
      console.log('[RestPoseApplicator] leftArm world down-vector:', down.toArray().map(v => v.toFixed(3)));
    }
    if (finalRightArm) {
      const worldQuat = new THREE.Quaternion();
      finalRightArm.getWorldQuaternion(worldQuat);
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(worldQuat);
      console.log('[RestPoseApplicator] rightArm world down-vector:', down.toArray().map(v => v.toFixed(3)));
    }

    if (!finalLeftArm && !finalRightArm) {
      const msg = 'No shoulder bones found — T-pose will persist. Bone names: ' + JSON.stringify(boneNames);
      console.warn('[RestPoseApplicator] ' + msg);
      logDevWarning(msg);
    } else {
      console.log('[RestPoseApplicator] Applied rest pose to:', {
        leftArm: finalLeftArm?.name,
        rightArm: finalRightArm?.name,
        leftForeArm: finalLeftForeArm?.name,
        rightForeArm: finalRightForeArm?.name,
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
        console.log(`[MorphTargetController] ${mesh.name}: ${keys.length} targets, sample:`, keys.slice(0, 5));

        const missingArkit = ['jawOpen', 'mouthClose', 'mouthSmileLeft', 'mouthFunnel', 'browInnerUp']
          .filter(s => !mesh.morphTargetDictionary![s] && ARKIT_INDEX[s] !== undefined);
        if (missingArkit.length > 0 && !MISSING_SHAPE_WARNED.has(`mesh:${mesh.name}`)) {
          MISSING_SHAPE_WARNED.add(`mesh:${mesh.name}`);
          if (keys.every(k => /^\d+$/.test(k))) {
            console.log(`[MorphTargetController] "${mesh.name}" uses numeric targets — using positional ARKIT order`);
          } else {
            logDevWarning(`"${mesh.name}" missing shapes: ${missingArkit.join(', ')}`);
          }
        }
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
  const fadingVisemeKeys = useRef<Set<string>>(new Set());

  const targetEmotionShapes = useMemo<EmotionShapeMap>(() => {
    if (emotion && EMOTION_SHAPES[emotion]) return EMOTION_SHAPES[emotion];
    return {};
  }, [emotion]);

  useFrame((_, delta) => {
    try {
      timeRef.current += delta;

      const visemeId = mode === 'talking' ? getCurrentViseme() : -1;
      if (visemeId !== prevVisemeId.current && visemeId >= 0) {
        for (const k of Object.keys(targetVisemeShapes.current)) {
          fadingVisemeKeys.current.add(k);
        }
        targetVisemeShapes.current = VISEME_SHAPES[visemeId] ?? {};
        prevVisemeId.current = visemeId;
      } else if (visemeId < 0 && prevVisemeId.current >= 0) {
        for (const k of Object.keys(targetVisemeShapes.current)) {
          fadingVisemeKeys.current.add(k);
        }
        targetVisemeShapes.current = {};
        prevVisemeId.current = -1;
      }

      for (const k of fadingVisemeKeys.current) {
        const cur = currentVisemeShapes.current[k as keyof VisemeShapeMap] ?? 0;
        if (cur < 0.01) fadingVisemeKeys.current.delete(k);
      }

      const allShapeKeys = new Set([
        ...Object.keys(targetVisemeShapes.current),
        ...Object.keys(targetEmotionShapes),
        ...fadingVisemeKeys.current,
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
            const smoothed = lerp(current, combined, Math.min(1, delta * 16));
            (currentVisemeShapes.current as Record<string, number>)[key] = smoothed;
            setShapeWeight(mesh, key, smoothed);
          }
        }

        if (isEyelash) {
          const blinkIdx = mesh.morphTargetDictionary?.['eyeBlinkLeft'] ?? 7;
          const blinkIdx2 = mesh.morphTargetDictionary?.['eyeBlinkRight'] ?? 8;
          setEyelashWeight(mesh, blinkIdx, blink);
          setEyelashWeight(mesh, blinkIdx2, blink);
          if (targetEmotionShapes.browInnerUp) {
            const browUpIdx = mesh.morphTargetDictionary?.['browInnerUp'] ?? 2;
            setEyelashWeight(mesh, browUpIdx, targetEmotionShapes.browInnerUp);
          }
          if (targetEmotionShapes.browDownLeft || targetEmotionShapes.browDownRight) {
            const browDown = Math.max(targetEmotionShapes.browDownLeft ?? 0, targetEmotionShapes.browDownRight ?? 0);
            const bdLeftIdx = mesh.morphTargetDictionary?.['browDownLeft'] ?? 0;
            const bdRightIdx = mesh.morphTargetDictionary?.['browDownRight'] ?? 1;
            setEyelashWeight(mesh, bdLeftIdx, browDown);
            setEyelashWeight(mesh, bdRightIdx, browDown);
          }
        }
      }
    } catch (err) {
      console.error('[MorphTargetController] frame error:', err);
    }
  });

  return null;
}

/* ── AutoCamera ─────────────────────────────────────────────────────────────
   Frames the camera after the model is grounded.
   ────────────────────────────────────────────────────────────────────────── */
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
        if (attempts >= MAX_ATTEMPTS) {
          console.error('[AutoCamera] Gave up framing after', attempts, 'attempts — bounding box never became valid', {
            min: box.min.toArray(), max: box.max.toArray(), boxSize: boxSize.toArray(),
          });
          return;
        }
        rafId = requestAnimationFrame(tryFrame);
        return;
      }

      scene.position.y -= box.min.y;
      const groundedBox = new THREE.Box3().setFromObject(scene);
      const groundedHeight = groundedBox.getSize(new THREE.Vector3()).y;
      const center = groundedBox.getCenter(new THREE.Vector3());
      const fovRad = (camera as THREE.PerspectiveCamera).fov * Math.PI / 360;

      const modeConfig: Record<CameraMode, { visibleFraction: number; focusYOffset: number; sideOffset: number; zOffset: number; lookAtOffsetY: number }> = {
        'over-shoulder': { visibleFraction: 0.28, focusYOffset: 0.40, sideOffset: 0.35, zOffset: -1, lookAtOffsetY: -0.02 },
        front:           { visibleFraction: 0.52, focusYOffset: 0.32, sideOffset: 0.05, zOffset: 0.95, lookAtOffsetY: 0 },
        portrait:        { visibleFraction: 0.20, focusYOffset: 0.45, sideOffset: 0.05, zOffset: 0.95, lookAtOffsetY: 0 },
        banner:          { visibleFraction: 0.40, focusYOffset: 0.35, sideOffset: 0.05, zOffset: 0.95, lookAtOffsetY: 0 },
      };
      const cfg = modeConfig[cameraMode] ?? modeConfig.front;
      const focusY = center.y + groundedHeight * cfg.focusYOffset;
      const distance = (groundedHeight * cfg.visibleFraction) / (2 * Math.tan(fovRad));
      camera.position.set(center.x + cfg.sideOffset, focusY + distance * 0.04, center.z + distance * cfg.zOffset);
      camera.lookAt(center.x, focusY + distance * cfg.lookAtOffsetY, center.z);
      if (cameraMode === 'over-shoulder') {
        camera.lookAt(center.x - 0.05, focusY - distance * 0.02, center.z + distance * 2);
      }
      console.log(`[AutoCamera] ${cameraMode} framing`, {
        groundedHeight, center: center.toArray(), focusY, distance,
        cameraPos: camera.position.toArray(),
        cameraAspect: (camera as THREE.PerspectiveCamera).aspect,
        cameraFov: (camera as THREE.PerspectiveCamera).fov,
      });

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

/* ── AnimatedModel ─────────────────────────────────────────────────────────
   Loads the GLB, applies rest-pose bone correction, animation controller,
   and morph-target OR fallback pose controller.
   ────────────────────────────────────────────────────────────────────────── */
export function AnimatedModel({ url, mode, emotion, gesture, cameraMode, cameraIntent, onFramed, disableAutoCamera }: {
  url: string;
  cameraMode?: CameraMode;
  cameraIntent: CameraIntent;
  onFramed?: () => void;
  disableAutoCamera?: boolean;
} & AvatarAnimationProps) {
  const { scene: originalScene } = useGLTF(url);
  const scene = useMemo(() => cloneSkeleton(originalScene) as THREE.Group, [originalScene]);
  const [hasMorphs, setHasMorphs] = useState(false);
  const [clipsLoaded, setClipsLoaded] = useState(false);

  useEffect(() => {
    if (scene) setHasMorphs(checkMorphTargets(scene));
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
      <RestPoseApplicator scene={scene} />
      {clipsLoaded && (
        <AnimationController scene={scene} mode={mode} emotion={emotion} gesture={gesture} />
      )}
      {hasMorphs ? (
        <MorphTargetController fbx={scene} mode={mode} emotion={emotion} gesture={gesture} />
      ) : (
        <PoseController fbx={scene} mode={mode} emotion={emotion} gesture={gesture} />
      )}
    </group>
  );
}
