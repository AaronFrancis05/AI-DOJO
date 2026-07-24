import * as THREE from 'three';

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

export class AnimationManager {
  model: THREE.Group | null = null;
  mixer: THREE.AnimationMixer | null = null;
  actions: Record<string, THREE.AnimationAction> = {};
  current: THREE.AnimationAction | null = null;
  ready = false;
  private _activeListener: ((e: THREE.Event) => void) | null = null;
  isTalking = false;

  init(
    model: THREE.Group,
    mixer: THREE.AnimationMixer,
    clips: Map<string, THREE.AnimationClip>,
    boneNames?: Set<string>,
  ): boolean {
    this.dispose();
    this.model = model;
    this.mixer = mixer;
    this.actions = {};
    this.current = null;

    let loaded = 0;

    for (const [name, clip] of clips.entries()) {
      if (!clip) continue;
      const filtered = this._filterFaceTracks(clip);
      filtered.name = name;
      let cleanClip = filtered;
      if (boneNames) {
        cleanClip = this._filterBoneTracks(filtered, boneNames, name);
      }
      const action = mixer.clipAction(cleanClip);
      action.setEffectiveTimeScale(1);
      if (!this._actionHasBindings(action)) continue;
      this.actions[name] = action;
      loaded += 1;
    }

    this.ready = loaded > 0;

    if (this.ready) {
      this.play('idle', { loop: true, fade: 0 });
    }

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
    const isGestureClip = clipName === 'bow' || clipName === 'shake_hands' || clipName === 'nod';
    const bodyTracks = clip.tracks.filter((t) => {
      const boneName = t.name.split('.')[0];
      if (!boneName) return true;
      if (!boneNames.has(boneName)) return false;
      if (isGestureClip) return true;
      if (/head|neck/i.test(boneName)) return false;
      if (t.name.includes('.position')) return false;
      return true;
    });
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
    return Boolean(this.actions[name]);
  }

  setTalkingState(talking: boolean): void {
    this.isTalking = !!talking;

    if (this.current && this.current === this.actions['offline']) return;
    if (
      this.current &&
      (this.current === this.actions['bow'] ||
        this.current === this.actions['shake_hands'] ||
        this.current === this.actions['nod'])
    ) {
      return;
    }

    const fallbackState = this.isTalking ? 'talking' : 'idle';
    this.play(fallbackState, { loop: true, fade: 0.7 });
  }

  play(
    name: string,
    { loop = true, fade = 0.7 }: { loop?: boolean; fade?: number } = {},
  ): boolean {
    if (!this.ready || !this.mixer || !name) return false;

    if (!this.actions[name]) return false;

    const isOneShot = name === 'bow' || name === 'shake_hands' || name === 'nod';
    const targetLoop = isOneShot ? false : loop;

    this._playAction(name, { loop: targetLoop, fade });
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

    const isOneShot = key === 'bow' || key === 'shake_hands' || key === 'nod';

    if (isOneShot) {
      const onFinished = (e: THREE.Event) => {
        const eventAction = (e as unknown as { action: THREE.AnimationAction }).action;
        if (eventAction !== next) return;

        this.mixer!.removeEventListener('finished', onFinished);
        if (this._activeListener === onFinished) {
          this._activeListener = null;
        }

        const fallbackClip = this.isTalking ? 'talking' : 'idle';
        this.play(fallbackClip, { loop: true, fade: 0.7 });
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
