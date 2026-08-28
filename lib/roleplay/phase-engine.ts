export type SessionPhase = 'orientation' | 'icebreaker' | 'guided' | 'unguided' | 'evaluation' | 'completed';

/**
 * Where inside a phase the session is.
 *
 * Every phase runs three beats: the character explains the stage ('open'),
 * plays it out ('body'), then concludes it ('closing'). The phase only
 * advances out of 'closing', which is what keeps one stage's wrap-up and the
 * next stage's introduction in separate turns.
 */
export type PhaseStep = 'open' | 'body' | 'closing';

export const PRONUNCIATION_PASS_THRESHOLD = 70;
export const PASSING_SCORE_THRESHOLD = 70;
export const STALL_THRESHOLD = 4;
/**
 * Raised from 25 to pay for the open/close beats each phase now spends: a
 * session that used to be force-completed at turn 25 mid-scene would
 * otherwise never reach its own debrief and farewell.
 */
export const SAFETY_CAP_TURN = 30;
export const UNGUIDED_MISTAKE_PENALTY = 5;
export const UNGUIDED_ENGLISH_PENALTY = 10;

export function nextPhase(
  current: SessionPhase,
  opts: {
    icebreakerDone: boolean;
    allGoalsCovered: boolean;
  },
): SessionPhase {
  if (current === 'orientation') return 'icebreaker';
  if (current === 'icebreaker' && opts.icebreakerDone) return 'guided';
  if (current === 'guided' && opts.allGoalsCovered) return 'unguided';
  if (current === 'unguided' && opts.allGoalsCovered) return 'evaluation';
  // The debrief is the last thing that happens in the scene; once it has been
  // delivered and closed off, the session is over. Without this edge the
  // evaluation phase could be entered but never left, which is why completion
  // used to be short-circuited straight out of `unguided`.
  if (current === 'evaluation') return 'completed';
  return current;
}

/**
 * Whether the phase has finished its work and should spend its next turn
 * concluding rather than continuing.
 */
export function isPhaseWorkDone(
  current: SessionPhase,
  opts: { icebreakerDone: boolean; allGoalsCovered: boolean },
): boolean {
  switch (current) {
    // Orientation is a single turn, and the debrief's own work — delivering
    // the scorecard — is done in its opening beat.
    case 'orientation':
    case 'evaluation':
      return true;
    case 'icebreaker':
      return opts.icebreakerDone;
    case 'guided':
    case 'unguided':
      return opts.allGoalsCovered;
    default:
      return false;
  }
}

/**
 * Orientation *is* an introduction — giving it a closing beat would have the
 * character conclude a stage they only just described, before the learner has
 * done anything in it. Every other phase earns its wrap-up.
 */
const PHASES_WITHOUT_CLOSING_BEAT = new Set<SessionPhase>(['orientation', 'completed']);

export interface PhaseState {
  phase: SessionPhase;
  step: PhaseStep;
}

/**
 * The whole phase lifecycle in one pure function: given where the session was
 * when this turn was generated, say where it is now.
 *
 * The beats are `open` (explain this stage, then begin it) → `body` (run it)
 * → `closing` (conclude it, with no forward reference). Only a `closing` turn
 * advances the phase, which is the rule that keeps a stage's wrap-up and the
 * next stage's introduction in two different messages. Previously the next
 * phase's hand-off line was string-appended to the turn that ended the old
 * one, so a single message concluded the vocabulary drill, opened the scene,
 * and announced the switch to full immersion.
 */
export function advancePhaseState(
  current: PhaseState,
  opts: { icebreakerDone: boolean; allGoalsCovered: boolean },
): PhaseState {
  const workDone = isPhaseWorkDone(current.phase, opts);

  if (current.step === 'closing') {
    // Entering `closing` already committed to the advance, so the gates are
    // satisfied by construction. Re-evaluating them here would let a learner
    // who happens to cover a goal on the wrap-up turn reset `stalledTurnCount`
    // and strand the session repeating its own conclusion.
    return {
      phase: nextPhase(current.phase, { icebreakerDone: true, allGoalsCovered: true }),
      step: 'open',
    };
  }

  if (!workDone) {
    return { phase: current.phase, step: 'body' };
  }

  if (PHASES_WITHOUT_CLOSING_BEAT.has(current.phase)) {
    return { phase: nextPhase(current.phase, opts), step: 'open' };
  }

  return { phase: current.phase, step: 'closing' };
}

/**
 * Weights for the composite score. Must sum to 1.0, because every input
 * dimension is an independent 0-100 value (see SCORE_DIMENSIONS in
 * lib/ai-engine.ts) — this function is the single place they are combined.
 *
 * `expressionAppropriateness` previously had no weight at all: it was graded,
 * persisted, and shown on the report, but silently contributed nothing to the
 * pass/fail verdict despite the per-language appropriateness rubric driving it.
 */
const SCORE_WEIGHTS = {
  vocabulary: 0.20,
  grammar: 0.20,
  fluency: 0.20,
  cultural: 0.15,
  task: 0.15,
  expressionAppropriateness: 0.10,
} as const;

/**
 * Combines the six 0-100 dimension scores into a single 0-100 composite,
 * which is what `PASSING_SCORE_THRESHOLD` is compared against.
 */
export function computeCompositeScore(phase: SessionPhase, scores: {
  vocabularyScore: number;
  grammarScore: number;
  fluencyScore: number;
  culturalScore: number;
  taskScore: number;
  expressionAppropriatenessScore?: number;
}): number {
  const clamp = (n: number | undefined | null) =>
    Math.max(0, Math.min(100, Number(n) || 0));

  return Math.round(
    clamp(scores.vocabularyScore) * SCORE_WEIGHTS.vocabulary +
    clamp(scores.grammarScore) * SCORE_WEIGHTS.grammar +
    clamp(scores.fluencyScore) * SCORE_WEIGHTS.fluency +
    clamp(scores.culturalScore) * SCORE_WEIGHTS.cultural +
    clamp(scores.taskScore) * SCORE_WEIGHTS.task +
    clamp(scores.expressionAppropriatenessScore) * SCORE_WEIGHTS.expressionAppropriateness,
  );
}