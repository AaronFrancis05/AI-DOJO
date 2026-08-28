import * as THREE from 'three';
import { getCurrentViseme, getTtsAnalyser, isSpeaking } from '@/lib/roleplay/tts';
import { asMorphMesh, type MorphMesh } from './ExpressionEngine';

/* ── Timing ──────────────────────────────────────────────────────────────
   A real jaw has mass: it drops onto a vowel quickly and comes back up more
   slowly, and the shapes either side of a consonant overlap rather than
   switching frame to frame. Driving open and closed at one high speed made
   the mouth flutter at the audio's frame rate — technically in sync, but read
   as chattering rather than talking.

   Each constant is an exponential rate: the weight covers ~63% of the
   remaining distance in 1/speed seconds. 13 ≈ 77 ms, 7 ≈ 140 ms — the range
   human articulators actually move in.
   ────────────────────────────────────────────────────────────────────── */

/** How fast the mouth opens as a sound starts (jaw drop). */
const MOUTH_OPEN_SPEED = 13;

/** How fast it closes again. Deliberately slower — jaws fall shut, they don't snap. */
const MOUTH_CLOSE_SPEED = 7;

/** How fast one mouth shape gives way to the next. */
const VISEME_BLEND_SPEED = 10;

/**
 * Smoothing on the loudness reading itself. The analyser reports per-frame RMS,
 * which jitters well above syllable rate; without this the jaw traced the
 * waveform instead of the speech.
 */
const LOUDNESS_SPEED = 11;

/* ── Mouth shapes ────────────────────────────────────────────────────────
   Every avatar in public/ai-avatars/models ships the Oculus viseme set
   (viseme_aa … viseme_RR), which maps almost one-to-one onto the viseme ids
   Azure sends. Consonants used to be collapsed into "crack the jaw a little",
   which is why speech read as a jaw hinging open and shut rather than as
   articulation. Four rigs in the catalog carry no jawOpen/mouthFunnel, and
   older rigs only have the five vowels, so every shape names a stand-in in
   SHAPE_FALLBACK.
   ────────────────────────────────────────────────────────────────────── */

type ShapeKey =
  | 'aa' | 'e' | 'i' | 'o' | 'u'
  | 'pp' | 'ff' | 'th' | 'dd' | 'kk' | 'ch' | 'ss' | 'nn' | 'rr'
  | 'jaw' | 'funnel' | 'pucker';

const SHAPE_CANDIDATES: Record<ShapeKey, string[]> = {
  aa: ['viseme_aa', 'aa', 'v_aa', 'blendShape.aa', 'blendShape.AA'],
  e: ['viseme_E', 'eh', 'v_E', 'blendShape.e', 'blendShape.E'],
  i: ['viseme_I', 'ih', 'v_I', 'blendShape.ih', 'blendShape.IH'],
  o: ['viseme_O', 'oh', 'v_O', 'blendShape.oh', 'blendShape.OH'],
  u: ['viseme_U', 'uh', 'v_U', 'blendShape.ou', 'blendShape.U'],
  pp: ['viseme_PP', 'viseme_pp'],
  ff: ['viseme_FF', 'viseme_ff'],
  th: ['viseme_TH', 'viseme_th'],
  dd: ['viseme_DD', 'viseme_dd'],
  kk: ['viseme_kk', 'viseme_KK'],
  ch: ['viseme_CH', 'viseme_ch'],
  ss: ['viseme_SS', 'viseme_ss'],
  nn: ['viseme_nn', 'viseme_NN'],
  rr: ['viseme_RR', 'viseme_rr'],
  jaw: ['jawOpen', 'jaw_open', 'jawOpenLeft', 'jaw_drop', 'blendShape.jawOpen', 'mouthOpen', 'mouth_drop'],
  funnel: ['mouthFunnel'],
  pucker: ['mouthPucker'],
};

/** What a shape borrows when the rig has no morph of its own for it. */
const SHAPE_FALLBACK: Partial<Record<ShapeKey, ShapeKey>> = {
  ff: 'i', th: 'i', ss: 'i', ch: 'u',
  dd: 'aa', kk: 'aa', nn: 'aa', rr: 'o',
  funnel: 'o', pucker: 'u', jaw: 'aa',
};

interface VisemeShape {
  /** Morph weights at full openness, before the loudness gain. */
  shapes: Partial<Record<ShapeKey, number>>;
  /** How far the jaw drops for this sound, as a fraction of openness. */
  jaw: number;
  /** Vowels scale with loudness; consonants stay crisp at any volume. */
  vowel: boolean;
}

/**
 * Azure viseme ids (forwarded unchanged from the speech service) to mouth
 * shapes:
 *   0=silence, 1=ae/ax/ah, 2=aa, 3=ao, 4=ey/eh/uh, 5=er, 6=iy/ih, 7=w/uw,
 *   8=ow, 9=aw, 10=oy, 11=ay, 12=h, 13=r, 14=l, 15=s/z, 16=sh/ch, 17=th/dh,
 *   18=f/v, 19=d/t/n, 20=k/g, 21=p/b/m.
 */
const AZURE_VISEMES: Record<number, VisemeShape> = {
  0: { shapes: {}, jaw: 0, vowel: true },
  1: { shapes: { aa: 0.50 }, jaw: 0.34, vowel: true },
  2: { shapes: { aa: 0.72 }, jaw: 0.50, vowel: true },
  3: { shapes: { o: 0.65, funnel: 0.22 }, jaw: 0.38, vowel: true },
  4: { shapes: { e: 0.65 }, jaw: 0.28, vowel: true },
  5: { shapes: { rr: 0.58, e: 0.22 }, jaw: 0.22, vowel: true },
  6: { shapes: { i: 0.65 }, jaw: 0.16, vowel: true },
  7: { shapes: { u: 0.65, pucker: 0.30 }, jaw: 0.13, vowel: true },
  8: { shapes: { o: 0.72, pucker: 0.22 }, jaw: 0.28, vowel: true },
  9: { shapes: { aa: 0.58, o: 0.36 }, jaw: 0.44, vowel: true },
  10: { shapes: { o: 0.50, i: 0.29 }, jaw: 0.31, vowel: true },
  11: { shapes: { aa: 0.65, i: 0.22 }, jaw: 0.44, vowel: true },
  12: { shapes: { aa: 0.29 }, jaw: 0.25, vowel: true },
  13: { shapes: { rr: 0.65 }, jaw: 0.16, vowel: false },
  14: { shapes: { nn: 0.58 }, jaw: 0.19, vowel: false },
  15: { shapes: { ss: 0.65 }, jaw: 0.08, vowel: false },
  16: { shapes: { ch: 0.65, pucker: 0.18 }, jaw: 0.11, vowel: false },
  17: { shapes: { th: 0.65 }, jaw: 0.13, vowel: false },
  18: { shapes: { ff: 0.65 }, jaw: 0.08, vowel: false },
  19: { shapes: { dd: 0.65 }, jaw: 0.16, vowel: false },
  20: { shapes: { kk: 0.65 }, jaw: 0.19, vowel: false },
  // Bilabial: the lips must actually meet, so no jaw at all.
  21: { shapes: { pp: 0.85 }, jaw: 0, vowel: false },
};

/** Amplitude-only fallback shape when no viseme stream is available. */
const NEUTRAL_OPEN: VisemeShape = { shapes: { aa: 0.60, o: 0.12 }, jaw: 0.34, vowel: true };

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

  /** Loudness after LOUDNESS_SPEED smoothing — see update(). */
  private _loudness = 0;

  private _expressionEngine: { setTalkingState: (t: boolean) => void } | null = null;
  private _externalAnalyser: AnalyserNode | null = null;
  private _faceMeshes: MorphMesh[] | null = null;
  private _shapes: Partial<Record<ShapeKey, string>> | null = null;
  /** Distinct morph names in _shapes — a rig without jawOpen aliases it. */
  private _shapeNames: string[] = [];
  /** This system's own weight per morph name — see _applyWeights(). */
  private _weights = new Map<string, number>();
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
        this._analyser.smoothingTimeConstant = 0.6;
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
    this._loudness = 0;
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
    const meshes = this._findFaceMeshes();
    if (meshes.length === 0) return;
    this._resolveShapes(meshes);

    for (const name of this._shapeNames) {
      this._weights.set(name, 0);
      for (const mesh of meshes) {
        const idx = mesh.morphTargetDictionary[name];
        if (idx !== undefined) mesh.morphTargetInfluences[idx] = 0;
      }
    }
  }

  /**
   * Every mesh carrying mouth morphs, not just the head: on these rigs the
   * teeth and tongue are separate meshes with their own jawOpen/viseme set,
   * and driving the head alone leaves the teeth hanging in place while the
   * jaw drops.
   */
  private _findFaceMeshes(): MorphMesh[] {
    if (this._faceMeshes) return this._faceMeshes;

    const known = new Set(Object.values(SHAPE_CANDIDATES).flat());
    const meshes: MorphMesh[] = [];

    this.model.traverse((obj) => {
      const morph = asMorphMesh(obj);
      if (!morph) return;
      if (Object.keys(morph.morphTargetDictionary).some((name) => known.has(name))) {
        meshes.push(morph);
      }
    });

    this._faceMeshes = meshes;
    return meshes;
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

  /**
   * Loudness of the audio actually coming out, normalized to 0..1, or null
   * when nothing measurable is routed through a Web Audio graph.
   * `getTtsAnalyser()` only hands back an analyser while real audio is passing
   * through it, so a near-zero reading here means a genuine pause in speech
   * rather than an unrouted voice.
   */
  private _readLoudness(analyser: AnalyserNode | null): number | null {
    if (!analyser) return null;
    if (!this._audioData || this._audioData.length !== analyser.fftSize) {
      this._audioData = new Uint8Array(analyser.fftSize) as unknown as Uint8Array<ArrayBuffer>;
    }
    analyser.getByteTimeDomainData(this._audioData);
    let sum = 0;
    for (let i = 0; i < this._audioData.length; i++) {
      const v = (this._audioData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this._audioData.length);
    return Math.min(1, Math.max(0, (rms - 0.012) * 7));
  }

  update(delta: number): void {
    const dt = delta || 0.016;
    const analyser = this._externalAnalyser || this._analyser || getTtsAnalyser();
    const speakingActive = this.playing || isSpeaking();

    const visemeId = this._resolveVisemeId();
    // Below zero means no viseme stream at all; zero is a real silence frame
    // that Azure sends at pauses, and must close the mouth. The id is only
    // trusted while something is actually speaking — a leftover id from the
    // last utterance would otherwise hold the mouth in that shape.
    const hasVisemeStream = speakingActive && visemeId >= 0;

    const rawLoudness = this._readLoudness(analyser);
    let loudness: number | null = null;
    if (rawLoudness === null) {
      this._loudness = 0;
    } else {
      this._loudness += (rawLoudness - this._loudness) * (1 - Math.exp(-LOUDNESS_SPEED * dt));
      loudness = this._loudness;
    }

    if (hasVisemeStream) {
      // The viseme decides the SHAPE; loudness decides how far the mouth opens
      // for it. A fixed opening made every syllable identically wide, which
      // reads as chewing rather than speaking.
      this.targetMouthOpen = visemeId === 0
        ? 0
        : loudness === null
          ? 0.48
          : Math.min(0.70, 0.24 + loudness * 0.46);
    } else if (speakingActive && loudness !== null) {
      this.targetMouthOpen = loudness > 0.04 ? loudness * 0.70 : 0;
    } else if (speakingActive) {
      // Audio is playing but never reaches the Web Audio graph (the browser
      // speechSynthesis fallback). Drive a synthetic talking pattern so the
      // mouth moves instead of freezing shut mid-utterance.
      // ~2.4 openings a second, the rate an unhurried speaker articulates at.
      const t = performance.now() * 0.001;
      const wave =
        Math.abs(Math.sin(t * 7.4)) * 0.7 + Math.abs(Math.sin(t * 4.1 + 1.3)) * 0.3;
      this.targetMouthOpen = 0.08 + wave * 0.46;
    } else {
      this.targetMouthOpen = 0;
    }

    const jawSpeed = this.targetMouthOpen > this.currentMouthOpen
      ? MOUTH_OPEN_SPEED
      : MOUTH_CLOSE_SPEED;
    const lerpFactor = 1 - Math.exp(-jawSpeed * dt);
    this.currentMouthOpen +=
      (this.targetMouthOpen - this.currentMouthOpen) * lerpFactor;
    this.currentMouthOpen = Math.max(0, Math.min(1, this.currentMouthOpen));

    if (
      this._expressionEngine &&
      typeof this._expressionEngine.setTalkingState === 'function'
    ) {
      // Tied to the utterance, not to the current frame's mouth opening:
      // ExpressionEngine ducks its mouth weights while this is true, and
      // toggling it per syllable pumped the character's smile in and out.
      this._expressionEngine.setTalkingState(speakingActive);
    }

    const meshes = this._findFaceMeshes();
    if (meshes.length === 0) return;

    const shapes = this._resolveShapes(meshes);
    const open = this.currentMouthOpen;

    // Where each morph should be *heading* this frame. Anything resolved but
    // not named here is heading to zero.
    const targets = new Map<string, number>();
    const want = (key: ShapeKey, value: number) => {
      const name = shapes[key];
      if (name === undefined || value <= 0) return;
      targets.set(name, Math.min(1, Math.max(targets.get(name) ?? 0, value)));
    };

    const viseme = hasVisemeStream
      // An id outside 0-21 would be a service change, not a silence.
      ? AZURE_VISEMES[visemeId] ?? NEUTRAL_OPEN
      : open > 0 ? NEUTRAL_OPEN : null;
    if (viseme) {
      // Consonants are short and often quiet — scaling them by loudness alone
      // made whole clusters vanish, so they keep most of their shape at any
      // volume while vowels track the envelope.
      const gain = viseme.vowel ? open : 0.45 + 0.40 * open;
      for (const [key, weight] of Object.entries(viseme.shapes) as [ShapeKey, number][]) {
        want(key, weight * gain);
      }
      want('jaw', viseme.jaw * open);
    }

    // Ease every mouth morph toward its target rather than snapping. Without
    // this, each new viseme cuts the previous one to zero in a single frame,
    // which reads as a chattering mouth instead of speech. Real articulation
    // overlaps — the jaw is still closing as the next vowel opens.
    const blend = 1 - Math.exp(-VISEME_BLEND_SPEED * dt);
    for (const name of this._shapeNames) {
      const target = targets.get(name) ?? 0;
      const current = this._weights.get(name) ?? 0;
      const next = current + (target - current) * blend;
      this._weights.set(name, next < 0.001 ? 0 : next);
    }

    this._applyWeights(meshes);
  }

  /**
   * Composes this frame's mouth weights over whatever the ExpressionEngine
   * already wrote.
   *
   * The blend above deliberately runs on _weights rather than on the meshes'
   * influence arrays. ExpressionEngine writes the whole face — mouth shapes
   * included — immediately before this in the frame, so reading an influence
   * back as "the value we set last frame" restarted the ease from the
   * expression's weight every single frame and pinned the mouth at roughly a
   * fifth of its target. That is what made speech barely visible.
   */
  private _applyWeights(meshes: MorphMesh[]): void {
    for (const mesh of meshes) {
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      this._weights.forEach((weight, name) => {
        const idx = dict[name];
        if (idx === undefined) return;
        influences[idx] = Math.min(1, Math.max(influences[idx] ?? 0, weight));
      });
    }
  }

  /** Resolves this model's naming convention for each mouth shape, once. */
  private _resolveShapes(meshes: MorphMesh[]): Partial<Record<ShapeKey, string>> {
    if (this._shapes) return this._shapes;

    const has = (name: string) =>
      meshes.some((m) => m.morphTargetDictionary[name] !== undefined);

    const direct = (key: ShapeKey): string | undefined =>
      SHAPE_CANDIDATES[key].find(has);

    const resolved: Partial<Record<ShapeKey, string>> = {};
    for (const key of Object.keys(SHAPE_CANDIDATES) as ShapeKey[]) {
      const fallback = SHAPE_FALLBACK[key];
      const name = direct(key) ?? (fallback ? direct(fallback) : undefined);
      if (name !== undefined) resolved[key] = name;
    }

    this._shapes = resolved;
    this._shapeNames = [...new Set(Object.values(resolved))];
    return resolved;
  }
}
