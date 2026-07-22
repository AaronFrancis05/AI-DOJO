import { ExpressionEngine } from './ExpressionEngine';
import { AnimationManager } from './AnimationManager';
import { LipSync } from './LipSync';

export interface EmotionSystemDeps {
  expression: ExpressionEngine;
  animation: AnimationManager;
  lipSync: LipSync;
}

export interface BehaviorData {
  reply?: string;
  text_en?: string;
  expression?: string;
  emotion?: string;
  animation?: string;
  audio_url?: string;
  audio_url_en?: string;
  audio_url_ja?: string;
  visemes_en?: unknown[];
  visemes_ja?: unknown[];
  visemes?: unknown[];
  primary?: string;
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
  ): { url?: string; visemes?: unknown[] } | null {
    const emotion = data.expression || data.emotion || 'neutral';
    const bodyKey = String(data.animation || 'talk').trim().toLowerCase();
    const isDefaultIdle = bodyKey === 'idle' || bodyKey === 'talk';
    const isOneShotGesture =
      bodyKey === 'thankful' || bodyKey === 'greeting' || bodyKey === 'nod' ||
      bodyKey === 'bow' || bodyKey === 'shake_hands';
    const isThinkingStance = bodyKey === 'think';
    const isStandaloneClip =
      !isThinkingStance &&
      !isOneShotGesture &&
      bodyKey !== 'talk' &&
      bodyKey !== 'idle' &&
      this.animation.hasClip(bodyKey);
    const hasAudio = !!(
      data.audio_url || data.audio_url_en || data.audio_url_ja
    );
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
            ? 'talking'
            : 'idle';

      if (hasAudio && (isOneShotGesture || trackToPlay === 'talking')) {
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

    const primary = data.primary || 'en';
    const audioUrl =
      primary === 'ja'
        ? data.audio_url_ja || data.audio_url
        : data.audio_url_en || data.audio_url;

    if (this.lipSync && audioUrl) {
      const full =
        audioUrl.startsWith('http') || audioUrl.startsWith('/')
          ? backendUrl + audioUrl
          : backendUrl + '/' + audioUrl;

      this.lipSync.play(full, data.visemes || [], () => {
        if (this.animation) {
          this.animation.isTalking = false;
          this.animation.play('idle', { loop: true, fade: 0.7 });
        }
        this.expression.setTalkingState(false);
        onComplete?.();
      });

      return { url: audioUrl, visemes: data.visemes || [] };
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
    lastAudio: { url: string; visemes: unknown[] } | null,
    backendUrl: string,
  ): void {
    if (!lastAudio) return;
    this.animation.play('talking', { loop: true, fade: 0.7 });
    if (this.lipSync) {
      this.lipSync.play(backendUrl + lastAudio.url, lastAudio.visemes, () => {
        this.animation.play('idle', { loop: true, fade: 0.7 });
        this.expression.setTalkingState(false);
      });
    }
  }
}
