import * as THREE from 'three';
import { getCurrentViseme } from '@/lib/roleplay/tts';

const MOUTH_SHAPES = ['aa', 'ih', 'oh'];
const LERP_SPEED = 24;

const VISEME_TARGETS = ['viseme_aa', 'viseme_I', 'viseme_O', 'viseme_U', 'jawOpen', 'mouthOpen'];

export class LipSync {
  model: THREE.Group;
  audio: HTMLAudioElement | null = null;
  playing = false;

  private _audioCtx: AudioContext | null = null;
  private _source: MediaElementAudioSourceNode | null = null;
  private _analyser: AnalyserNode | null = null;
  private _audioData: Uint8Array | null = null;

  currentMouthOpen = 0;
  targetMouthOpen = 0;

  private _expressionEngine: { setTalkingState: (t: boolean) => void } | null = null;
  private _externalAnalyser: AnalyserNode | null = null;

  constructor(model: THREE.Group) {
    this.model = model;
  }

  set expressionEngine(
    engine: { setTalkingState: (t: boolean) => void } | null,
  ) {
    this._expressionEngine = engine;
  }

  setExternalAnalyser(analyser: AnalyserNode | null): void {
    this._externalAnalyser = analyser;
  }

  simulateTalking(active: boolean): void {
    if (active) {
      this.stop();
      this.playing = true;
      if (this._expressionEngine) {
        this._expressionEngine.setTalkingState(true);
      }
    } else {
      this.stop();
    }
  }

  async play(
    audioUrl?: string,
    _visemes?: unknown[],
    onComplete?: (() => void) | null,
  ): Promise<HTMLAudioElement | undefined> {
    this.stop();
    if (!audioUrl) {
      onComplete?.();
      return;
    }

    this.audio = new Audio(audioUrl);
    this.audio.crossOrigin = 'anonymous';

    this.audio.onended = () => {
      this.stop();
      onComplete?.();
    };

    this.audio.onerror = () => {
      this.stop();
      onComplete?.();
    };

    this.audio.onplay = () => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) {
          this.playing = true;
          if (this._expressionEngine) this._expressionEngine.setTalkingState(true);
          return;
        }
        this._audioCtx = new AC();
        if (!this.audio) throw new Error('Audio element is null');
        this._source = this._audioCtx.createMediaElementSource(this.audio);
        this._analyser = this._audioCtx.createAnalyser();
        this._analyser.fftSize = 1024;
        this._analyser.smoothingTimeConstant = 0.4;
        this._source.connect(this._analyser);
        this._analyser.connect(this._audioCtx.destination);
        this._audioData = new Uint8Array(this._analyser.fftSize);
        this.playing = true;
        if (this._expressionEngine) this._expressionEngine.setTalkingState(true);
      } catch {
        this.playing = true;
        if (this._expressionEngine) this._expressionEngine.setTalkingState(true);
      }
    };

    try {
      await this.audio.play();
    } catch {
      onComplete?.();
    }
    return this.audio;
  }

  stop(): void {
    this.playing = false;
    this.targetMouthOpen = 0;
    this.currentMouthOpen = 0;

    if (this._expressionEngine) {
      this._expressionEngine.setTalkingState(false);
    }

    if (this.audio) {
      try {
        this.audio.pause();
      } catch { /* ignore */ }
      this.audio = null;
    }

    if (this._source) {
      try { this._source.disconnect(); } catch { /* ignore */ }
      this._source = null;
    }

    if (this._audioCtx && this._audioCtx.state !== 'closed') {
      try { this._audioCtx.close(); } catch { /* ignore */ }
    }
    this._audioCtx = null;

    this._analyser = null;
    this._audioData = null;
    this._clearMouthShapes();
  }

  private _clearMouthShapes(): void {
    const faceMesh = this._findFaceMesh();
    if (!faceMesh) return;
    const dict = faceMesh.morphTargetDictionary;
    const influences = faceMesh.morphTargetInfluences;
    if (!dict || !influences) return;
    MOUTH_SHAPES.forEach((m) => {
      const idx = dict[m];
      if (idx !== undefined) influences[idx] = 0;
    });
  }

  private _findFaceMesh(): THREE.SkinnedMesh | null {
    let faceMesh: THREE.SkinnedMesh | null = null;
    this.model.traverse((obj) => {
      if (
        obj instanceof THREE.SkinnedMesh &&
        obj.morphTargetDictionary &&
        obj.morphTargetInfluences
      ) {
        if (obj.name.toLowerCase().includes('head') || !faceMesh) {
          faceMesh = obj;
        }
      }
    });
    return faceMesh;
  }

  update(delta: number): void {
    const dt = delta || 0.016;

    const analyser = this._externalAnalyser || this._analyser;

    if (this.playing && analyser && this._audioData) {
      analyser.getByteTimeDomainData(this._audioData as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < this._audioData.length; i++) {
        const v = (this._audioData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this._audioData.length);
      this.targetMouthOpen = Math.min(0.46, Math.max(0, (rms - 0.012) * 3.2));
    } else if (this.playing && !analyser) {
      const t = performance.now() * 0.001;
      const wave =
        Math.abs(Math.sin(t * 9.5)) * 0.7 + Math.abs(Math.sin(t * 5.3 + 1.3)) * 0.3;
      this.targetMouthOpen = 0.06 + wave * 0.40;
    } else {
      this.targetMouthOpen = 0;
    }

    const lerpFactor = 1 - Math.exp(-LERP_SPEED * dt);
    this.currentMouthOpen +=
      (this.targetMouthOpen - this.currentMouthOpen) * lerpFactor;
    this.currentMouthOpen = Math.max(0, Math.min(1, this.currentMouthOpen));

    if (
      this._expressionEngine &&
      typeof this._expressionEngine.setTalkingState === 'function'
    ) {
      this._expressionEngine.setTalkingState(this.currentMouthOpen > 0.02);
    }

    const faceMesh = this._findFaceMesh();
    if (!faceMesh) return;

    const dict = faceMesh.morphTargetDictionary;
    const influences = faceMesh.morphTargetInfluences;
    if (!dict || !influences) return;

    const realVisemeId = getCurrentViseme();

    if (realVisemeId >= 0) {
      VISEME_TARGETS.forEach((v) => {
        const idx = dict[v];
        if (idx !== undefined) influences[idx] = 0;
      });

      const visemeAA = dict['viseme_aa'];
      const visemeO = dict['viseme_O'];
      const jawFallback =
        dict['jawOpen'] ?? dict['mouthOpen'] ?? dict['mouthClose'];

      if (visemeAA !== undefined && visemeO !== undefined) {
        influences[visemeAA] = Math.min(
          1.0,
          (influences[visemeAA] ?? 0) + this.currentMouthOpen * 0.85,
        );
        influences[visemeO] = Math.min(
          1.0,
          (influences[visemeO] ?? 0) + this.currentMouthOpen * 0.15,
        );
      } else if (jawFallback !== undefined) {
        influences[jawFallback] = Math.min(
          1.0,
          (influences[jawFallback] ?? 0) + this.currentMouthOpen,
        );
      }
    } else {
      VISEME_TARGETS.forEach((v) => {
        const idx = dict[v];
        if (idx !== undefined) influences[idx] = 0;
      });

      const visemeAA = dict['viseme_aa'];
      const visemeO = dict['viseme_O'];
      const jawFallback =
        dict['jawOpen'] ?? dict['mouthOpen'] ?? dict['mouthClose'];

      if (visemeAA !== undefined && visemeO !== undefined) {
        influences[visemeAA] = Math.min(
          1.0,
          this.currentMouthOpen * 0.85,
        );
        influences[visemeO] = Math.min(
          1.0,
          this.currentMouthOpen * 0.15,
        );
      } else if (jawFallback !== undefined) {
        influences[jawFallback] = Math.min(
          1.0,
          this.currentMouthOpen,
        );
      }
    }
  }
}
