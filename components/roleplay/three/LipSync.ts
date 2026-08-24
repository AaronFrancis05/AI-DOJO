import * as THREE from 'three';
import { getCurrentViseme, getTtsAnalyser, isSpeaking } from '@/lib/roleplay/tts';

const LERP_SPEED = 24;

/**
 * How fast one mouth shape gives way to the next. Slower than LERP_SPEED (the
 * overall open/closed amount) so consecutive visemes overlap the way real
 * articulation does, instead of cutting between shapes frame to frame.
 */
const VISEME_BLEND_SPEED = 16;

/** Azure viseme id groupings — see the table in update(). */
const CLOSED_CONSONANTS = new Set([13, 14, 15, 16, 17, 18, 19, 20, 21]);
const AA_VISEMES = new Set([1, 2, 9, 11]);
const O_VISEMES = new Set([3, 8, 10]);
const E_VISEMES = new Set([4, 5]);

interface ResolvedShapes {
  aa?: number;
  o?: number;
  i?: number;
  u?: number;
  e?: number;
  jaw?: number;
}

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
  private _shapes: ResolvedShapes | null = null;
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
    VISEME_TARGETS.forEach((m) => {
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
    const hasViseme = realVisemeId > 0;

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
      const fromAnalyser = Math.min(0.46, Math.max(0, (rms - 0.012) * 3.2));
      if (fromAnalyser > 0.02) {
        this.targetMouthOpen = fromAnalyser;
      } else {
        // audio is supposedly playing but the Web Audio graph is silent (e.g.
        // browser speechSynthesis fallback, which never routes through the
        // ttsAnalyser). Drive a synthetic talking pattern so the mouth moves
        // instead of freezing shut mid-utterance.
        const t = performance.now() * 0.001;
        const wave =
          Math.abs(Math.sin(t * 9.5)) * 0.7 + Math.abs(Math.sin(t * 5.3 + 1.3)) * 0.3;
        this.targetMouthOpen = 0.06 + wave * 0.40;
      }
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

    const shapes = this._resolveShapes(dict);

    // Where each morph should be *heading* this frame. Anything not named
    // here is heading to zero.
    const targets = new Map<number, number>();
    const want = (idx: number | undefined, value: number) => {
      if (idx === undefined) return;
      targets.set(idx, Math.min(1, Math.max(targets.get(idx) ?? 0, value)));
    };

    const open = Math.min(1, this.currentMouthOpen);

    // Azure viseme IDs (forwarded unchanged from the speech service):
    //   0=silence, 1=ae/ax/ah, 2=aa, 3=ao, 4=ey/eh/uh, 5=er, 6=iy/ih, 7=w/uw,
    //   8=ow, 9=aw, 10=oy, 11=ay, 12=h, 13=r, 14=l, 15=s/z, 16=sh/ch, 17=th/dh,
    //   18=f/v, 19=d/t/n, 20=k/g, 21=p/b/m.
    // Vowels map to an open mouth shape; consonants must NOT be forced into a
    // vowel shape. Most consonants still crack the jaw so the mouth moves with
    // speech, while 21 (bilabial p/b/m) closes it completely.
    if (realVisemeId === 21) {
      // Lips together — no jaw, no vowel.
    } else if (CLOSED_CONSONANTS.has(realVisemeId)) {
      want(shapes.jaw, open * 0.5);
    } else if (AA_VISEMES.has(realVisemeId)) {
      want(shapes.aa, open);
    } else if (O_VISEMES.has(realVisemeId)) {
      want(shapes.o, open);
    } else if (E_VISEMES.has(realVisemeId)) {
      want(shapes.e, open);
    } else if (realVisemeId === 6) {
      want(shapes.i, open);
    } else if (realVisemeId === 7) {
      want(shapes.u, open);
    } else if (realVisemeId === 12) {
      want(shapes.jaw ?? shapes.aa, open);
    } else if (realVisemeId > 0 || open > 0) {
      // No viseme stream (amplitude-driven fallback): a neutral open shape.
      if (shapes.aa !== undefined && shapes.o !== undefined) {
        want(shapes.aa, open * 0.85);
        want(shapes.o, open * 0.15);
      } else {
        want(shapes.aa ?? shapes.o ?? shapes.jaw, open);
      }
    }

    // Ease every mouth morph toward its target rather than snapping. Without
    // this, each new viseme cuts the previous one to zero in a single frame,
    // which reads as a chattering mouth instead of speech. Real articulation
    // overlaps — the jaw is still closing as the next vowel opens.
    const blend = 1 - Math.exp(-VISEME_BLEND_SPEED * dt);
    for (const name of VISEME_TARGETS) {
      const idx = dict[name];
      if (idx === undefined) continue;
      const target = targets.get(idx) ?? 0;
      const currentValue = influences[idx] ?? 0;
      const next = currentValue + (target - currentValue) * blend;
      influences[idx] = next < 0.001 ? 0 : next;
    }
  }

  /** Resolves this model's naming convention for each mouth shape, once. */
  private _resolveShapes(dict: Record<string, number>): ResolvedShapes {
    if (this._shapes) return this._shapes;

    const pick = (...names: string[]): number | undefined => {
      for (const n of names) {
        if (dict[n] !== undefined) return dict[n];
      }
      return undefined;
    };

    this._shapes = {
      aa: pick('viseme_aa', 'aa', 'v_aa', 'blendShape.aa', 'blendShape.AA'),
      o: pick('viseme_O', 'oh', 'v_O', 'blendShape.oh', 'blendShape.OH'),
      i: pick('viseme_I', 'ih', 'v_I', 'blendShape.ih', 'blendShape.IH'),
      u: pick('viseme_U', 'uh', 'v_U', 'blendShape.ou', 'blendShape.U'),
      e: pick('viseme_E', 'eh', 'v_E', 'blendShape.e', 'blendShape.E'),
      jaw: pick('jawOpen', 'jaw_open', 'jawOpenLeft', 'jaw_drop', 'blendShape.jawOpen')
        ?? pick('mouthOpen', 'mouth_drop'),
    };

    return this._shapes;
  }
}
