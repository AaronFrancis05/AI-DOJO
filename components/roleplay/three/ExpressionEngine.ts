import * as THREE from 'three';

type MorphMesh = THREE.Object3D & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

function asMorphMesh(obj: THREE.Object3D): MorphMesh | null {
  const m = obj as unknown as MorphMesh;
  if (m.morphTargetDictionary && m.morphTargetInfluences) {
    return m;
  }
  return null;
}

const COMBINED_EXPRESSIONS: Record<string, Record<string, number>> = {
  happy: {
    mouthSmileLeft: 0.60,
    mouthSmileRight: 0.60,
    mouthSmile: 0.5,
    mouthUpperUpLeft: 0.3,
    mouthUpperUpRight: 0.3,
    mouthDimpleLeft: 0.30,
    mouthDimpleRight: 0.30,
    mouthLowerDownLeft: 0.2,
    mouthLowerDownRight: 0.2,
    cheekSquintLeft: 0.4,
    cheekSquintRight: 0.4,
    eyeSquintLeft: 0.3,
    eyeSquintRight: 0.3,
    browInnerUp: 0.3,
  },
  sad: {
    browDownLeft: 0.20,
    browDownRight: 0.20,
    browOuterUpLeft: 0.65,
    browOuterUpRight: 0.65,
    mouthFrownLeft: 0.80,
    mouthFrownRight: 0.80,
    mouthShrugLower: 0.45,
    mouthDimpleLeft: 0.30,
    mouthDimpleRight: 0.30,
    eyeSquintLeft: 0.25,
    eyeSquintRight: 0.25,
  },
  surprised: {
    eyeWideLeft: 1.0,
    eyeWideRight: 1.0,
    browInnerUp: 0.90,
    browOuterUpLeft: 0.70,
    browOuterUpRight: 0.70,
    jawOpen: 0.35,
    mouthFunnel: 0.25,
  },
  angry: {
    browDownLeft: 0.75,
    browDownRight: 0.75,
    browInnerUp: 0.0,
    eyeSquintLeft: 0.50,
    eyeSquintRight: 0.50,
    mouthStretchLeft: 0.40,
    mouthStretchRight: 0.40,
    mouthFrownLeft: 0.45,
    mouthFrownRight: 0.45,
    mouthRollLower: 0.40,
    mouthRollUpper: 0.40,
  },
  scared: {
    browInnerUp: 0.85,
    browDownLeft: 0.60,
    browDownRight: 0.60,
    browOuterUpLeft: 0.0,
    browOuterUpRight: 0.0,
    eyeWideLeft: 0.85,
    eyeWideRight: 0.85,
    eyeSquintLeft: 0.0,
    eyeSquintRight: 0.0,
    mouthStretchLeft: 0.80,
    mouthStretchRight: 0.80,
    mouthSmileLeft: 0.0,
    mouthSmileRight: 0.0,
    mouthRollLower: 0.50,
    mouthRollUpper: 0.40,
    mouthUpperUpLeft: 0.25,
    mouthUpperUpRight: 0.25,
    mouthLowerDownLeft: 0.25,
    mouthLowerDownRight: 0.25,
    jawOpen: 0.18,
    jawForward: 0.10,
    viseme_FF: 0.30,
    viseme_CH: 0.20,
    mouthShrugLower: 0.20,
  },
  relaxed: {
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
    eyeBlinkLeft: 0.2,
    eyeBlinkRight: 0.2,
    eyeLookDownLeft: 0.3,
    eyeLookDownRight: 0.3,
    browDownLeft: 0.3,
    browDownRight: 0.3,
    browInnerUp: 0.3,
    cheekSquintLeft: 0.3,
    cheekSquintRight: 0.3,
    jawOpen: 0.5,
    mouthPressLeft: 0.3,
    mouthPressRight: 0.4,
    mouthFrownLeft: 0.3,
    mouthFrownRight: 0.1,
    mouthStretchLeft: 0.3,
    mouthStretchRight: 0.2,
    mouthSmileRight: 0.2,
    mouthSmileLeft: 0.0,
    mouthDimpleLeft: 0.0,
    mouthDimpleRight: 0.0,
    eyeWideLeft: 0.0,
    eyeWideRight: 0.0,
  },
  neutral: {},
};

const EMOTION_ALIASES: Record<string, string> = {
  friendly: 'happy',
  loving: 'happy',
  concerned: 'sad',
  worried: 'sad',
  confused: 'surprised',
  thinking: 'relaxed',
  fear: 'scared',
  afraid: 'scared',
  'formal-polite': 'relaxed',
  grateful: 'happy',
  apologetic: 'sad',
};

export type BlinkState = 'waiting' | 'closing' | 'opening';

export class ExpressionEngine {
  model: THREE.Group;
  faceMesh: MorphMesh | null = null;
  targetWeights: Record<string, number> = {};
  currentWeights: Record<string, number> = {};
  activeEmotion = 'neutral';
  isTalking = false;

  private _blinkState: BlinkState = 'waiting';
  private _blinkProgress = 0;
  private _blinkTimer = 3.0;

  constructor(model: THREE.Group) {
    this.model = model;
    this._findFaceMesh();
  }

  setAvatarModel(newModel: THREE.Group): void {
    this.model = newModel;
    this._findFaceMesh();
  }

  setTalkingState(talking: boolean): void {
    this.isTalking = !!talking;
  }

  private _findFaceMesh(): void {
    let found: MorphMesh | null = null;
    const root = this.model;
    root.traverse((obj) => {
      const morph = asMorphMesh(obj);
      if (morph) {
        if (obj.name.toLowerCase().includes('head') || !found) {
          found = morph;
        }
      }
    });
    this.faceMesh = found;

    if (found) {
      const dict = (found as unknown as Record<string, unknown>).morphTargetDictionary as Record<string, number>;
      if (dict) {
        Object.keys(dict).forEach((key) => {
          this.targetWeights[key] = 0;
          if (this.currentWeights[key] === undefined) {
            this.currentWeights[key] = 0;
          }
        });
      }
    }
  }

  setExpression(emotion: string): void {
    if (!this.faceMesh) this._findFaceMesh();
    if (!this.faceMesh) return;

    const clean = (emotion || 'neutral').trim().toLowerCase();
    const targetEmotion =
      EMOTION_ALIASES[clean] || (COMBINED_EXPRESSIONS[clean] ? clean : 'neutral');
    this.activeEmotion = targetEmotion;

    Object.keys(this.targetWeights).forEach((key) => {
      this.targetWeights[key] = 0;
    });

    const designLayout = COMBINED_EXPRESSIONS[targetEmotion] || {};
    const dict = this.faceMesh.morphTargetDictionary;
    Object.entries(designLayout).forEach(([morphName, targetWeight]) => {
      if (dict[morphName] !== undefined) {
        this.targetWeights[morphName] = targetWeight;
      }
    });
  }

  update(delta: number): void {
    if (!this.faceMesh) {
      this._findFaceMesh();
      return;
    }

    const dt = delta || 0.016;
    const dict = this.faceMesh.morphTargetDictionary;
    const influences = this.faceMesh.morphTargetInfluences;
    if (!dict || !influences) return;

    const lerpFactor = 1 - Math.exp(-1.5 * dt);

    Object.keys(this.targetWeights).forEach((key) => {
      let targetValue = this.targetWeights[key];

      if (this.isTalking) {
        const isMouthKey =
          key.includes('mouth') ||
          key.includes('jaw') ||
          key.includes('lip') ||
          key.includes('cheek') ||
          key.includes('viseme');

        if (isMouthKey) {
          targetValue *= 0.2;
        }
      }

      this.currentWeights[key] +=
        (targetValue - this.currentWeights[key]) * lerpFactor;

      const index = dict[key];
      if (index !== undefined) {
        influences[index] = Math.max(0, Math.min(1, this.currentWeights[key]));
      }
    });

    if (this._blinkState === 'waiting') {
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0) this._blinkState = 'closing';
    } else if (this._blinkState === 'closing') {
      this._blinkProgress += dt * 14;
      if (this._blinkProgress >= 1) {
        this._blinkProgress = 1;
        this._blinkState = 'opening';
      }
    } else if (this._blinkState === 'opening') {
      this._blinkProgress -= dt * 10;
      if (this._blinkProgress <= 0) {
        this._blinkProgress = 0;
        this._blinkState = 'waiting';
        this._blinkTimer = 3.0 + Math.random() * 3.0;
      }
    }

    const leftIdx = dict['eyeBlinkLeft'] ?? dict['eyeBlink_L'];
    const rightIdx = dict['eyeBlinkRight'] ?? dict['eyeBlink_R'];

    const blinkVal = this._blinkState !== 'waiting' ? this._blinkProgress : 0;
    if (leftIdx !== undefined) influences[leftIdx] = blinkVal;
    if (rightIdx !== undefined) influences[rightIdx] = blinkVal;
  }
}
