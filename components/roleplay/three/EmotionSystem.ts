import { ExpressionEngine } from './ExpressionEngine';
import { AnimationManager, ANIMATION_ALIASES } from './AnimationManager';
import { LipSync, VisemeFrame } from './LipSync';

export interface EmotionSystemDeps {
  expression: ExpressionEngine;
  animation: AnimationManager;
  lipSync: LipSync;
}

export interface BehaviorData {
  emotionTone?: string;
  gestureHint?: string;
  animation?: string;
  audioUrl?: string;
  visemes?: VisemeFrame[];
}

export class EmotionSystem {
  expression: ExpressionEngine;
  animation: AnimationManager;
  lipSync: LipSync;

  constructor({ expression, animation, lipSync }: EmotionSystemDeps) {
    this.expression = expression;
    this.animation = animation;
    this.lipSync = lipSync;
  }

  startThinking(): void {
    this.lipSync.stop();
    this.expression.setExpression('neutral');
    if (this.animation.hasClip('think')) {
      this.animation.play('think', { loop: true, fade: 0.7 });
    }
  }

  stopThinking(): void {
    if (
      this.animation.current === this.animation.actions['think']
    ) {
      this.animation.playIdle();
    }
  }

  startTalking(): void {
    this.lipSync.simulateTalking(true);
  }

  stopTalking(): void {
    this.lipSync.simulateTalking(false);
  }

  startListening(): void {
    this.lipSync.stop();
    this.expression.setExpression('neutral');
    if (this.animation.hasClip('listening')) {
      this.animation.play('listening', { loop: true, fade: 0.7 });
    }
  }

  stopListening(): void {
    if (
      this.animation.current === this.animation.actions['listening']
    ) {
      this.animation.playIdle();
    }
  }

  apply(
    data: BehaviorData,
    backendUrl = '',
    onComplete?: (() => void) | null,
  ): { url?: string; visemes?: VisemeFrame[] } | null {
    const emotion = data.emotionTone || 'neutral';
    const rawKey = String(data.animation || data.gestureHint || 'talk').trim().toLowerCase();
    const bodyKey = ANIMATION_ALIASES[rawKey] ?? rawKey;
    const isDefaultIdle = bodyKey === 'idle' || bodyKey === 'talk';
    const isOneShotGesture =
      bodyKey === 'thankful' || bodyKey === 'greeting' || bodyKey === 'nod';
    const isThinkingStance = bodyKey === 'think';
    const isStandaloneClip =
      !isThinkingStance &&
      !isOneShotGesture &&
      bodyKey !== 'talk' &&
      bodyKey !== 'idle' &&
      this.animation.hasClip(bodyKey);
    const hasAudio = !!data.audioUrl;
    const shouldLoop = isOneShotGesture
      ? false
      : isStandaloneClip
        ? true
        : isDefaultIdle || hasAudio;

    this.expression.setExpression(emotion);

    if (this.animation) {
      const trackToPlay = isThinkingStance
        ? bodyKey
        : isOneShotGesture || isStandaloneClip
          ? bodyKey
          : hasAudio
            ? 'talk'
            : 'idle';

      if (hasAudio && (isOneShotGesture || trackToPlay === 'talk')) {
        this.animation.isTalking = true;
      }
      if (isStandaloneClip) {
        this.animation.isTalking = hasAudio;
      }

      const usedClip = this.animation.play(trackToPlay, { loop: shouldLoop, fade: 0.7 });

      if (!usedClip && bodyKey !== 'talk') {
        this.animation.play(bodyKey, { loop: shouldLoop, fade: 0.7 });
      }
    }

    if (this.lipSync && data.audioUrl) {
      const resolvedUrl = data.audioUrl.startsWith('http')
        ? data.audioUrl
        : data.audioUrl.startsWith('/')
          ? backendUrl + data.audioUrl
          : backendUrl + '/' + data.audioUrl;

      this.lipSync.play(resolvedUrl, data.visemes, () => {
        if (this.animation) {
          this.animation.isTalking = false;
          this.animation.play('idle', { loop: true, fade: 0.7 });
        }
        this.expression.setTalkingState(false);
        onComplete?.();
      });

      return { url: resolvedUrl, visemes: data.visemes };
    }

    onComplete?.();
    return null;
  }

  reset(): void {
    this.animation.playIdle();
    this.expression.setExpression('neutral');
    this.lipSync.stop();
  }

  replayExplain(
    lastAudio: { url: string; visemes?: VisemeFrame[] } | null,
  ): void {
    if (!lastAudio) return;
    this.animation.play('talk', { loop: true, fade: 0.7 });
    if (this.lipSync) {
      this.lipSync.play(lastAudio.url, lastAudio.visemes, () => {
        this.animation.play('idle', { loop: true, fade: 0.7 });
        this.expression.setTalkingState(false);
      });
    }
  }
}
