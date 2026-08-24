import type { TurnPromptContext } from './types';
import {
  buildGuidedPrompt,
  buildIcebreakerPrompt,
  buildOrientationPrompt,
  buildUnguidedPrompt,
} from './phases';

export type { TurnPromptContext, PromptVocab, PromptGoal } from './types';
export { describeReplyContract } from './reply-contract';
export { generateLocalizedPhaseMessage } from './phase-messages';
export type { PhaseMessageKind } from './phase-messages';
export { icebreakerPhrase } from './icebreaker-phrases';
export type { IcebreakerPhraseKey } from './icebreaker-phrases';
export { displayVocab, sameLangWordLine, resolveBlank } from './shared';

/**
 * Selects and builds the system prompt for a turn.
 *
 * Single entry point so the streaming route never has to know how phases map
 * to prompts — and so analysis (via describeReplyContract) is reasoning about
 * the same set of contracts these builders emit.
 */
export function buildTurnSystemPrompt(ctx: TurnPromptContext): string {
  switch (ctx.phase) {
    case 'orientation':
      return buildOrientationPrompt(ctx);

    case 'icebreaker':
      // Once the word list is exhausted the icebreaker is over in all but
      // name; the guided prompt is what should drive the turn.
      return ctx.vocab.length === 0 || ctx.currentVocabIndex > ctx.vocab.length
        ? buildGuidedPrompt(ctx)
        : buildIcebreakerPrompt(ctx);

    case 'guided':
      return buildGuidedPrompt(ctx);

    default:
      return buildUnguidedPrompt(ctx);
  }
}

/**
 * The user-role message for a turn: the learner's actual words plus the
 * minimum state the model needs that the conversation history can't carry.
 */
export function buildTurnUserMessage(
  ctx: TurnPromptContext,
  input: string,
  turnNo: number,
): string {
  if (ctx.isSessionStart) {
    return `[SESSION START] The learner is ready to begin. This is your first turn.`;
  }

  if (ctx.userProducedCurrentWord) {
    return `[Turn ${turnNo}] The learner says: "${input}"

They have already produced word ${ctx.currentVocabIndex} correctly in that message. Acknowledge it in a few words and move straight to the next word — do not ask them to repeat it.`;
  }

  return `[Turn ${turnNo}] The learner says: "${input}"`;
}
