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
  talk: 'Talking.glb',
  think: 'Thinking.glb',
  listening: 'Listening.glb',
  thankful: 'Thankful.glb',
  nod: 'Nod.glb',
  greeting: 'Greeting.glb',
  offline: 'Offline.glb',
};

/** Clips that play once and hand the body back, rather than looping. */
export const ONE_SHOT_CLIPS = new Set(['greeting', 'thankful', 'nod']);

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

export class AnimationManager {
  model: THREE.Group | null = null;
  mixer: THREE.AnimationMixer | null = null;
  actions: Record<string, THREE.AnimationAction> = {};
  current: THREE.AnimationAction | null = null;
  ready = false;
  private _activeListener: ((e: THREE.Event) => void) | null = null;
  isTalking = false;

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

    const action = this.mixer.clipAction(cleanClip);
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
    const entries = Object.entries(ANIMATION_MANIFEST);

    const results = await Promise.all(
      entries.map(async ([name, file]) => ({ name, clip: await loadClip(file) })),
    );

    // The mixer may have been disposed while clips were in flight (a fast
    // unmount); registering onto a dead mixer would throw.
    if (!this.mixer) return false;

    let loaded = 0;
    for (const { name, clip } of results) {
      if (!clip) continue;
      // Each instance needs its own AnimationClip: clipAction caches by clip
      // object, so sharing one across avatars would make them share actions.
      if (this._registerClip(name, clip.clone(), boneNames)) loaded += 1;
    }

    this.ready = loaded > 0;
    if (this.ready) this.play('idle', { loop: true, fade: 0 });
    return this.ready;
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

  private _actionHasBindings(action: THREE.AnimationAction): boolean {
    try {
      const bindings = (action as unknown as { _propertyBindings?: unknown[] })._propertyBindings;
      return Boolean(bindings && bindings.length > 0);
    } catch {
      return Boolean(action.getClip().tracks.length);
    }
  }

  hasClip(name: string): boolean {
    const normalized = String(name).trim().toLowerCase();
    const key = ANIMATION_ALIASES[normalized] ?? normalized;
    return Boolean(this.actions[key]);
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

    const normalized = String(name).trim().toLowerCase();
    const key = ANIMATION_ALIASES[normalized] ?? normalized;

    if (!key || !this.actions[key]) return false;

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
