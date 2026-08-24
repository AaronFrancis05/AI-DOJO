import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CLIP_BASE = '/ai-avatars/animations/';

const ANIMATION_ALIASES: Record<string, string> = {
  talking: 'talk',
  thinking: 'think',
  bow: 'greeting',
  shake_hands: 'thankful',
  wave: 'greeting',
};

export { ANIMATION_ALIASES, CLIP_BASE };

/**
 * Clips are served as .glb (generated from the .fbx sources by
 * `npm run avatars:convert`). The FBX originals were ~10.2 MB in total and
 * were parsed on the main thread by FBXLoader on every single avatar mount;
 * the GLB equivalents are ~2.5 MB and go through the same GLTFLoader the
 * character models already use.
 */
const ANIMATION_MANIFEST: Record<string, string> = {
  idle: 'Idle.glb',
  // Talking.glb (still on disk) is a 6s clip whose largest joint swing is 11°
  // — the character stands motionless through an entire reply, which is why
  // the body read as frozen while its audio played. Talking1.glb is 37s of
  // real gesticulation (arms and hands swinging 35-95°), long enough that the
  // loop never visibly repeats within a turn.
  talk: 'Talking1.glb',
  think: 'Thinking.glb',
  listening: 'Listening.glb',
  thankful: 'Thankful.glb',
  nod: 'Nod.glb',
  greeting: 'Greeting.glb',
  offline: 'Offline.glb',
};

/** Clips that play once and hand the body back, rather than looping. */
export const ONE_SHOT_CLIPS = new Set(['greeting', 'thankful', 'nod']);

/**
 * The one clip the character cannot be shown without. init() waits for this
 * and nothing else; the remaining ~2 MB of clips stream in behind it and
 * register as they land. Waiting for the whole manifest meant the avatar stood
 * in its bare rest pose — arms out, unanimated — for as long as the slowest
 * clip took, which is what made every session open on a lifeless mannequin.
 */
const PRIORITY_CLIP = 'idle';

/* ── Facing ─────────────────────────────────────────────────────────────
   Which bones decide the direction the character is standing/looking, and
   how much of that direction a clip baked in. See _faceForward().
   ────────────────────────────────────────────────────────────────────── */

const UP = new THREE.Vector3(0, 1, 0);
const ROOT_BONE = 'hips';
const HEAD_BONE = 'head';

const matchesBone = (trackName: string, bone: string): boolean => {
  const name = trackName.split('.')[0].toLowerCase();
  return name === bone || name.endsWith(`:${bone}`);
};

/**
 * The clip's average yaw, averaged as a direction rather than as a number so
 * keys either side of ±180° don't cancel each other out.
 */
const meanYaw = (values: ArrayLike<number>): number => {
  const count = Math.floor(values.length / 4);
  if (count === 0) return 0;

  let sumSin = 0;
  let sumCos = 0;
  for (let i = 0; i < count; i++) {
    const x = values[i * 4];
    const y = values[i * 4 + 1];
    const z = values[i * 4 + 2];
    const w = values[i * 4 + 3];
    const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
    sumSin += Math.sin(yaw);
    sumCos += Math.cos(yaw);
  }
  return Math.atan2(sumSin, sumCos);
};

const isFaceTrack = (name: string): boolean => {
  const lower = name.toLowerCase();
  return (
    lower.includes('blendshape') ||
    lower.includes('morphtarget') ||
    lower.includes('expression') ||
    lower.includes('vrm') ||
    lower.includes('face') ||
    lower.includes('eye') ||
    lower.includes('jaw') ||
    lower.includes('mouth') ||
    lower.includes('brow')
  );
};

/* ── Shared clip cache ──────────────────────────────────────────────────
   Clip files are identical for every avatar, so they are fetched and
   parsed once per page load and shared by every AnimationManager instance.
   Promises (not results) are cached so concurrent mounts coalesce onto one
   request instead of racing.

   This also makes freeze/unfreeze cheap: re-initializing used to re-download
   and re-parse the entire manifest.
   ────────────────────────────────────────────────────────────────────── */

const clipCache = new Map<string, Promise<THREE.AnimationClip | null>>();
let sharedLoader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (!sharedLoader) sharedLoader = new GLTFLoader();
  return sharedLoader;
}

function loadClip(file: string): Promise<THREE.AnimationClip | null> {
  const cached = clipCache.get(file);
  if (cached) return cached;

  const promise = getLoader()
    .loadAsync(CLIP_BASE + file)
    .then((gltf) => gltf.animations?.[0] ?? null)
    .catch((err) => {
      console.warn(`[AnimationManager] Failed to load clip "${file}":`, err);
      // Drop the rejection from the cache so a later mount can retry rather
      // than inheriting a permanent failure from one flaky request.
      clipCache.delete(file);
      return null;
    });

  clipCache.set(file, promise);
  return promise;
}

/**
 * Starts fetching the clip set before any avatar is mounted, so the clips come
 * down alongside the character GLB instead of queueing behind it — the manager
 * only asks for them once the model has finished downloading and parsing.
 *
 * The idle clip goes first on its own: it is the only one blocking the reveal,
 * and putting the other 2 MB on the wire next to it would slow down the very
 * thing being waited for.
 */
export function preloadAnimationClips(): Promise<void> {
  return loadClip(ANIMATION_MANIFEST[PRIORITY_CLIP]).then(() => {
    for (const [name, file] of Object.entries(ANIMATION_MANIFEST)) {
      if (name !== PRIORITY_CLIP) loadClip(file);
    }
  });
}

export class AnimationManager {
  model: THREE.Group | null = null;
  mixer: THREE.AnimationMixer | null = null;
  actions: Record<string, THREE.AnimationAction> = {};
  current: THREE.AnimationAction | null = null;
  ready = false;
  private _activeListener: ((e: THREE.Event) => void) | null = null;
  isTalking = false;
  /** Manifest keys still on the wire — see canPlay() and play(). */
  private _loading = new Set<string>();
  /** A clip asked for before it had streamed in, applied once it lands. */
  private _pending: { key: string; loop: boolean; fade: number } | null = null;
  /** Bumped by dispose() so in-flight clips never register onto a dead mixer. */
  private _generation = 0;

  async init(
    model: THREE.Group,
    mixer: THREE.AnimationMixer,
    clips?: Map<string, THREE.AnimationClip> | null,
    boneNames?: Set<string>,
  ): Promise<boolean> {
    this.dispose();
    this.model = model;
    this.mixer = mixer;
    this.actions = {};
    this.current = null;

    if (clips) {
      return this._initWithClips(clips, boneNames);
    }

    return this._initFromManifest(boneNames);
  }

  private _registerClip(
    name: string,
    clip: THREE.AnimationClip,
    boneNames?: Set<string>,
  ): boolean {
    if (!this.mixer) return false;

    const key = ANIMATION_ALIASES[name] ?? name;
    const filtered = this._filterFaceTracks(clip);
    filtered.name = key;

    const cleanClip = boneNames ? this._filterBoneTracks(filtered, boneNames, key) : filtered;
    const facingClip = this._faceForward(cleanClip, key);

    const action = this.mixer.clipAction(facingClip);
    action.setEffectiveTimeScale(1);
    if (!this._actionHasBindings(action)) return false;

    this.actions[key] = action;
    return true;
  }

  private _initWithClips(
    clips: Map<string, THREE.AnimationClip>,
    boneNames?: Set<string>,
  ): boolean {
    let loaded = 0;
    for (const [name, clip] of clips.entries()) {
      if (!clip) continue;
      if (this._registerClip(name, clip, boneNames)) loaded += 1;
    }
    this.ready = loaded > 0;
    if (this.ready) this.play('idle', { loop: true, fade: 0 });
    return this.ready;
  }

  private async _initFromManifest(boneNames?: Set<string>): Promise<boolean> {
    const generation = this._generation;
    for (const name of Object.keys(ANIMATION_MANIFEST)) this._loading.add(name);

    const idle = await loadClip(ANIMATION_MANIFEST[PRIORITY_CLIP]);
    // The mixer may have been disposed while the clip was in flight (a fast
    // unmount); registering onto a dead mixer would throw.
    if (this._generation !== generation || !this.mixer) return false;

    this._loading.delete(PRIORITY_CLIP);
    // Each instance needs its own AnimationClip: clipAction caches by clip
    // object, so sharing one across avatars would make them share actions.
    if (idle && this._registerClip(PRIORITY_CLIP, idle.clone(), boneNames)) {
      this.ready = true;
      this.play(PRIORITY_CLIP, { loop: true, fade: 0 });
    }

    void this._loadRemainingClips(boneNames, generation);
    return this.ready;
  }

  /**
   * Registers the rest of the manifest as it arrives, without blocking the
   * first idle frame. A mode change that landed while its clip was still in
   * flight is honoured here rather than dropped — see play().
   */
  private async _loadRemainingClips(
    boneNames: Set<string> | undefined,
    generation: number,
  ): Promise<void> {
    const entries = Object.entries(ANIMATION_MANIFEST).filter(
      ([name]) => name !== PRIORITY_CLIP,
    );

    await Promise.all(
      entries.map(async ([name, file]) => {
        const clip = await loadClip(file);
        if (this._generation !== generation || !this.mixer) return;

        this._loading.delete(name);
        if (!clip) return;
        if (!this._registerClip(name, clip.clone(), boneNames)) return;

        this.ready = true;
        this._flushPendingPlay();
      }),
    );

    if (this._generation === generation) this._loading.clear();
  }

  private _flushPendingPlay(): void {
    const pending = this._pending;
    if (!pending || !this.actions[pending.key]) return;
    this._pending = null;
    this.play(pending.key, { loop: pending.loop, fade: pending.fade });
  }

  private _filterFaceTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
    if (!clip?.tracks?.length) return clip;
    const tracks = clip.tracks.filter((t) => !isFaceTrack(t.name));
    if (tracks.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  private _filterBoneTracks(
    clip: THREE.AnimationClip,
    boneNames: Set<string>,
    clipName: string,
  ): THREE.AnimationClip {
    // Head and neck tracks are deliberately KEPT for every clip, including
    // idle and talk. They used to be stripped from non-gesture clips, which
    // left the character's head locked rigidly forward the entire session —
    // the single biggest reason the avatar read as lifeless.
    const bodyTracks = clip.tracks.filter((t) => {
      const boneName = t.name.split('.')[0];
      if (!boneName) return true;
      if (!boneNames.has(boneName)) return false;
      // Root motion would slide the character away from its framed position.
      if (t.name.includes('.position')) return false;
      return true;
    });

    // A near-total wipe means the clip's node names don't match this model's
    // skeleton rather than that the tracks were genuinely unwanted. Keep the
    // clip intact and let three bind whatever it can, instead of silently
    // producing an animation that moves nothing.
    if (bodyTracks.length < clip.tracks.length * 0.1) {
      console.warn(
        `[AnimationManager] Clip "${clipName}" matched almost no bones on this ` +
        `skeleton (${bodyTracks.length}/${clip.tracks.length}); using it unfiltered.`,
      );
      return clip;
    }

    if (bodyTracks.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(clip.name, clip.duration, bodyTracks);
  }

  /**
   * Removes the constant yaw a clip was authored with, so every clip stands
   * facing the same way and `CameraIntent` stays the only thing that decides
   * which way that is.
   *
   * Mixamo bakes whichever direction the actor happened to face into the clip.
   * Most of the set sits within 3.5° of centre, but Talking1 stands 30° off at
   * the hips and looks a further 10° off with the head, so the character spent
   * every reply turned away from the learner while its idle pose faced them.
   * Only the mean is removed — the sway and the head turns around it survive
   * untouched, and for the already-centred clips this shifts nothing visible.
   *
   * The head is left alone on one-shot gestures: across a 37s loop a constant
   * head yaw is a bias, but across a 2s nod it IS the gesture.
   */
  private _faceForward(clip: THREE.AnimationClip, key: string): THREE.AnimationClip {
    const bones = ONE_SHOT_CLIPS.has(key) ? [ROOT_BONE] : [ROOT_BONE, HEAD_BONE];

    let corrected = false;
    const quaternion = new THREE.Quaternion();
    const correction = new THREE.Quaternion();

    const tracks = clip.tracks.map((track) => {
      if (!(track instanceof THREE.QuaternionKeyframeTrack)) return track;
      if (!bones.some((bone) => matchesBone(track.name, bone))) return track;

      const bias = meanYaw(track.values);
      if (Math.abs(bias) < 1e-4) return track;

      const next = track.clone();
      correction.setFromAxisAngle(UP, -bias);
      for (let i = 0; i < next.values.length; i += 4) {
        quaternion.fromArray(next.values, i).premultiply(correction).normalize();
        quaternion.toArray(next.values, i);
      }
      corrected = true;
      return next;
    });

    // A new clip rather than a mutated one: filtering above can hand back the
    // cached clip untouched, and that object is shared with every other avatar.
    return corrected ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : clip;
  }

  private _actionHasBindings(action: THREE.AnimationAction): boolean {
    try {
      const bindings = (action as unknown as { _propertyBindings?: unknown[] })._propertyBindings;
      return Boolean(bindings && bindings.length > 0);
    } catch {
      return Boolean(action.getClip().tracks.length);
    }
  }

  hasClip(name: string): boolean {
    return Boolean(this.actions[this._key(name)]);
  }

  /**
   * Whether asking for this clip will eventually move the body: either it is
   * loaded, or it is still streaming in and play() will queue the request.
   * Callers guard on this rather than on hasClip() so a mode change in the
   * first second of a session isn't silently discarded.
   */
  canPlay(name: string): boolean {
    const key = this._key(name);
    return Boolean(this.actions[key]) || this._loading.has(key);
  }

  private _key(name: string): string {
    const normalized = String(name).trim().toLowerCase();
    return ANIMATION_ALIASES[normalized] ?? normalized;
  }

  setTalkingState(talking: boolean): void {
    this.isTalking = !!talking;

    if (this.current && this.current === this.actions['offline']) return;
    if (this.current && ONE_SHOT_CLIPS.has(this._keyForAction(this.current))) return;

    this.play(this.isTalking ? 'talk' : 'idle', { loop: true, fade: 0.7 });
  }

  private _keyForAction(action: THREE.AnimationAction): string {
    for (const [key, value] of Object.entries(this.actions)) {
      if (value === action) return key;
    }
    return '';
  }

  play(
    name: string,
    { loop = true, fade = 0.7 }: { loop?: boolean; fade?: number } = {},
  ): boolean {
    if (!this.ready || !this.mixer || !name) return false;

    const key = this._key(name);
    if (!key) return false;

    if (!this.actions[key]) {
      // Still streaming in: remember the request so the pose lands when the
      // clip does, instead of leaving the body in whatever it was doing.
      if (this._loading.has(key)) this._pending = { key, loop, fade };
      return false;
    }

    this._pending = null;
    const isOneShot = ONE_SHOT_CLIPS.has(key);
    this._playAction(key, { loop: isOneShot ? false : loop, fade });
    return true;
  }

  private _playAction(
    key: string,
    { loop, fade }: { loop: boolean; fade: number },
  ): void {
    const next = this.actions[key];
    if (!next) return;

    if (this._activeListener) {
      this.mixer!.removeEventListener('finished', this._activeListener);
      this._activeListener = null;
    }

    // Re-issuing the clip that is already looping would restart it from frame
    // zero, producing a visible hitch every time state is re-asserted.
    if (this.current === next && next.isRunning() && loop) return;

    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = true;

    if (this.current && this.current !== next) {
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      this.current.crossFadeTo(next, fade, false);
    } else {
      next.play();
    }

    if (ONE_SHOT_CLIPS.has(key)) {
      const onFinished = (e: THREE.Event) => {
        const eventAction = (e as unknown as { action: THREE.AnimationAction }).action;
        if (eventAction !== next) return;

        this.mixer!.removeEventListener('finished', onFinished);
        if (this._activeListener === onFinished) this._activeListener = null;

        this.play(this.isTalking ? 'talk' : 'idle', { loop: true, fade: 0.7 });
      };

      this._activeListener = onFinished;
      this.mixer!.addEventListener('finished', onFinished);
    }

    this.current = next;
  }

  playIdle(): boolean {
    if (this._activeListener) {
      this.mixer?.removeEventListener('finished', this._activeListener);
      this._activeListener = null;
    }
    this.isTalking = false;
    return this.play('idle', { loop: true, fade: 0.7 });
  }

  /**
   * Suspends playback without tearing down the mixer or the loaded actions,
   * so resuming is instant. Used for the off-screen/idle-freeze optimization,
   * which previously called dispose() and then re-ran the whole init.
   */
  setPaused(paused: boolean): void {
    if (!this.mixer) return;
    this.mixer.timeScale = paused ? 0 : 1;
  }

  update(delta: number): void {
    this.mixer?.update(delta || 0.016);
  }

  dispose(): void {
    this._generation += 1;
    this._loading.clear();
    this._pending = null;
    if (this.mixer && this._activeListener) {
      this.mixer.removeEventListener('finished', this._activeListener);
    }
    this._activeListener = null;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.model = null;
    this.ready = false;
  }
}
