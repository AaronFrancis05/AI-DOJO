import type { TurnPromptContext } from './types';
import {
  buildEvaluationPrompt,
  buildFarewellPrompt,
  buildGuidedPrompt,
  buildIcebreakerPrompt,
  buildOrientationPrompt,
  buildPhaseClosingPrompt,
  buildUnguidedPrompt,
  phaseOpeningDirective,
} from './phases';

export type { TurnPromptContext, PromptVocab, PromptGoal, EvaluationSummary } from './types';
export { describeReplyContract } from './reply-contract';
export { icebreakerPhrase } from './icebreaker-phrases';
export type { IcebreakerPhraseKey } from './icebreaker-phrases';
export { displayVocab, sameLangWordLine, resolveBlank } from './shared';

/**
 * The prompt that runs a phase's ordinary turn, ignoring which beat it is.
 */
function buildPhaseBodyPrompt(ctx: TurnPromptContext): string {
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

    case 'unguided':
      return buildUnguidedPrompt(ctx);

    case 'evaluation':
      return buildEvaluationPrompt(ctx);

    case 'completed':
      return buildFarewellPrompt(ctx);
  }
}

/**
 * Selects and builds the system prompt for a turn.
 *
 * Single entry point so the streaming route never has to know how phases map
 * to prompts — and so analysis (via describeReplyContract) is reasoning about
 * the same set of contracts these builders emit.
 *
 * Dispatch is on the phase AND the beat within it. There is deliberately no
 * `default:` branch on the phase switch above: the previous one quietly
 * handed `evaluation` and `completed` the *unguided* prompt, so the debrief
 * phase could be entered and would just keep playing the scene.
 */
export function buildTurnSystemPrompt(ctx: TurnPromptContext): string {
  // The debrief owns both its beats: the scorecard, then the farewell.
  if (ctx.phase === 'evaluation') {
    return ctx.phaseStep === 'closing' ? buildFarewellPrompt(ctx) : buildEvaluationPrompt(ctx);
  }

  if (ctx.phaseStep === 'closing') {
    return buildPhaseClosingPrompt(ctx);
  }

  const body = buildPhaseBodyPrompt(ctx);

  // Orientation is itself an introduction to the session, so layering an
  // "introduce this stage" directive on top would just say it twice.
  return ctx.phaseStep === 'open' && ctx.phase !== 'orientation'
    ? `${body}\n\n${phaseOpeningDirective(ctx)}`
    : body;
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
