import type { PhaseStep, SessionPhase } from '../phase-engine';

/** The vocabulary fields a prompt needs; a subset of the `vocabulary` row. */
export interface PromptVocab {
  targetText: string;
  phonetic: string | null;
  translation: string;
  usageTip?: string | null;
}

/** The scenario-goal fields a prompt needs. */
export interface PromptGoal {
  sequenceOrder: number;
  goalType: string;
  goalText: string;
}

/**
 * Everything the turn prompts need, assembled once per turn by the route.
 *
 * Generation and analysis both build from this same shape so they cannot
 * describe different output contracts — which is exactly what happened when
 * the generation prompts lived inline in the streaming route and the analysis
 * prompt lived in lib/ai-engine.ts.
 */
/**
 * The session's own read on how the learner did, handed to the evaluation
 * prompt so the character can speak a real scorecard instead of improvising
 * one. Every figure here is already computed by the streaming route.
 */
export interface EvaluationSummary {
  vocabulary: number;
  grammar: number;
  fluency: number;
  cultural: number;
  task: number;
  expressionAppropriateness: number;
  /** Weighted 0-100 composite — what the pass/fail verdict is drawn from. */
  composite: number;
  passed: boolean;
  passingScore: number;
  /** Percentage of drilled icebreaker words the learner produced correctly, or null when none were recorded. */
  icebreakerRecallPct: number | null;
  /** Median time between the character finishing and the learner replying, or null when untimed. */
  medianResponseMs: number | null;
  /** The most instructive mistakes of the session, already corrected. */
  notableCorrections: Array<{ original: string; corrected: string }>;
  goalsCovered: number;
  goalsTotal: number;
}

export interface TurnPromptContext {
  phase: SessionPhase;
  /** Which beat of the phase this turn is: introduce it, run it, or conclude it. */
  phaseStep: PhaseStep;
  /** Target and native language are the same, so no ⟦ ⟧ separation applies. */
  isSameLanguage: boolean;
  /** First turn of the session — the character has not spoken yet. */
  isSessionStart: boolean;

  targetLangName: string;
  nativeLangName: string;
  /**
   * Whether a phonetic gloss is trustworthy for this language. The base
   * `phonetic` column holds Japanese romaji, so it is meaningless once
   * vocabulary is localized into another target language.
   */
  showPhonetic: boolean;

  scenarioTitle: string;
  situationContext: string;
  situationLearningGoals: string;
  aiCharacterName: string;
  aiCharacterRole: string;

  learnerName: string;
  learnerCountry: string | null;
  /** 'standard' | 'trouble' — how cooperative the character should be. */
  behaviorMode: string;
  /** Difficulty tier the learner is working at. */
  difficulty: string;

  vocab: PromptVocab[];
  goals: PromptGoal[];
  completedSequenceOrders: number[];

  /** 1-based index of the vocabulary item currently being drilled. */
  currentVocabIndex: number;
  /** The learner's last message already contained the word being drilled. */
  userProducedCurrentWord: boolean;

  /**
   * Present only on the evaluation phase's opening beat — the one turn where
   * the character reports back on the session rather than playing a scene.
   */
  evaluation?: EvaluationSummary;

  /** The lesson this session belongs to, when it came from a course rather than free practice. */
  lessonTitle?: string | null;
}
