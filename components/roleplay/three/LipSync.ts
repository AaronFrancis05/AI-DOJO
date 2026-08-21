import * as THREE from 'three';
import { getCurrentViseme, getTtsAnalyser, isSpeaking } from '@/lib/roleplay/tts';

const MOUTH_SHAPES = ['aa', 'ih', 'oh'];
const LERP_SPEED = 24;

const VISEME_TARGETS = [
  'viseme_aa', 'aa', 'v_aa', 'blendShape.aa', 'blendShape.AA',
  'viseme_I', 'ih', 'v_I', 'blendShape.ih', 'blendShape.IH',
  'viseme_O', 'oh', 'v_O', 'blendShape.oh', 'blendShape.OH',
  'viseme_U', 'uh', 'v_U', 'blendShape.ou', 'blendShape.U',
  'viseme_E', 'eh', 'v_E', 'blendShape.e', 'blendShape.E',
  'jawOpen', 'jaw_open', 'jawOpenLeft', 'jaw_drop', 'blendShape.jawOpen',
  'mouthOpen', 'mouthClose', 'mouth_drop',
];

export interface VisemeFrame {
  id: number;
  offsetMs: number;
}

export class LipSync {
  model: THREE.Group;
  audio: HTMLAudioElement | null = null;
  playing = false;

  private _audioCtx: AudioContext | null = null;
  private _source: MediaElementAudioSourceNode | null = null;
  private _analyser: AnalyserNode | null = null;
  private _audioData: Uint8Array<ArrayBuffer> | null = null;

  currentMouthOpen = 0;
  targetMouthOpen = 0;

  private _expressionEngine: { setTalkingState: (t: boolean) => void } | null = null;
  private _externalAnalyser: AnalyserNode | null = null;
  private _cachedFaceMesh: THREE.SkinnedMesh | null = null;
  private _visemeTimeline: VisemeFrame[] | null = null;
  private _visemeIndex = 0;

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
    visemes?: VisemeFrame[],
    onComplete?: (() => void) | null,
  ): Promise<HTMLAudioElement | undefined> {
    this.stop();
    if (!audioUrl) {
      onComplete?.();
      return;
    }

    if (visemes && visemes.length > 0) {
      this._visemeTimeline = visemes;
      this._visemeIndex = 0;
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
        this._audioData = new Uint8Array(this._analyser.fftSize) as unknown as Uint8Array<ArrayBuffer>;
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
    this._visemeTimeline = null;
    this._visemeIndex = 0;

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
    if (this._cachedFaceMesh) return this._cachedFaceMesh;
    let best: THREE.SkinnedMesh | null = null;
    let bestScore = -1;

    this.model.traverse((obj) => {
      if (
        obj instanceof THREE.SkinnedMesh &&
        obj.morphTargetDictionary &&
        obj.morphTargetInfluences
      ) {
        const dict = obj.morphTargetDictionary;
        const nameHint = (obj.name?.toLowerCase().includes('head') ?? false) ? 1 : 0;
        const hasVisemeOrJaw =
          'viseme_aa' in dict || 'viseme_O' in dict || 'jawOpen' in dict
            ? 2
            : 0;
        const score = hasVisemeOrJaw + nameHint;
        if (score > bestScore) {
          bestScore = score;
          best = obj;
        }
      }
    });

    this._cachedFaceMesh = best;
    return best;
  }

  private _resolveVisemeId(): number {
    if (this._visemeTimeline && this.audio) {
      const elapsedMs = this.audio.currentTime * 1000;
      while (this._visemeIndex < this._visemeTimeline.length && this._visemeTimeline[this._visemeIndex].offsetMs <= elapsedMs) {
        this._visemeIndex++;
      }
      if (this._visemeIndex > 0) {
        return this._visemeTimeline[this._visemeIndex - 1].id;
      }
    }
    return getCurrentViseme();
  }

  update(delta: number): void {
    const dt = delta || 0.016;
    const analyser = this._externalAnalyser || this._analyser || getTtsAnalyser();
    const speakingActive = this.playing || isSpeaking();

    const realVisemeId = this._resolveVisemeId();
    const hasViseme = realVisemeId >= 0;

    if (hasViseme) {
      this.playing = true;
      this.targetMouthOpen = 0.35;
    } else if (speakingActive && analyser) {
      if (!this._audioData) {
        this._audioData = new Uint8Array(analyser.fftSize) as unknown as Uint8Array<ArrayBuffer>;
      }
      analyser.getByteTimeDomainData(this._audioData);
      let sum = 0;
      for (let i = 0; i < this._audioData.length; i++) {
        const v = (this._audioData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this._audioData.length);
      this.targetMouthOpen = Math.min(0.46, Math.max(0, (rms - 0.012) * 3.2));
    } else if (speakingActive && !analyser) {
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

    function resolveMorph(d: Record<string, number>, name: string, ...aliases: string[]): number | undefined {
      for (const a of [name, ...aliases]) {
        const idx = d[a];
        if (idx !== undefined) return idx;
      }
      return undefined;
    }

    const visemeAA = resolveMorph(dict, 'viseme_aa', 'aa', 'v_aa', 'blendShape.aa', 'blendShape.AA');
    const visemeO = resolveMorph(dict, 'viseme_O', 'oh', 'v_O', 'blendShape.oh', 'blendShape.OH');
    const visemeI = resolveMorph(dict, 'viseme_I', 'ih', 'v_I', 'blendShape.ih', 'blendShape.IH');
    const visemeU = resolveMorph(dict, 'viseme_U', 'uh', 'v_U', 'blendShape.ou', 'blendShape.U');
    const visemeE = resolveMorph(dict, 'viseme_E', 'eh', 'v_E', 'blendShape.e', 'blendShape.E');
    const jawFallback =
      resolveMorph(dict, 'jawOpen', 'jaw_open', 'jawOpenLeft', 'jaw_drop', 'blendShape.jawOpen') ??
      resolveMorph(dict, 'mouthOpen', 'mouth_drop');

    VISEME_TARGETS.forEach((v) => {
      const idx = dict[v];
      if (idx !== undefined) influences[idx] = 0;
    });

    if (realVisemeId === 2 && visemeAA !== undefined) {
      influences[visemeAA] = Math.min(1.0, this.currentMouthOpen);
    } else if (realVisemeId === 3 && visemeO !== undefined) {
      influences[visemeO] = Math.min(1.0, this.currentMouthOpen);
    } else if (realVisemeId === 4 && visemeE !== undefined) {
      influences[visemeE] = Math.min(1.0, this.currentMouthOpen);
    } else if (realVisemeId === 6 && visemeI !== undefined) {
      influences[visemeI] = Math.min(1.0, this.currentMouthOpen);
    } else if (realVisemeId === 7 && visemeU !== undefined) {
      influences[visemeU] = Math.min(1.0, this.currentMouthOpen);
    } else if (realVisemeId === 8 && visemeO !== undefined) {
      influences[visemeO] = Math.min(1.0, this.currentMouthOpen);
    } else if (visemeAA !== undefined && visemeO !== undefined) {
      influences[visemeAA] = Math.min(1.0, this.currentMouthOpen * 0.85);
      influences[visemeO] = Math.min(1.0, this.currentMouthOpen * 0.15);
    } else if (jawFallback !== undefined) {
      influences[jawFallback] = Math.min(1.0, this.currentMouthOpen);
    }
  }
}
