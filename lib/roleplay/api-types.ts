import type { AvatarSource } from '@/lib/avatar/catalog';
import type { CorrectionItem } from '@/lib/ai-engine';
import type { NextLessonTarget } from '@/lib/courses/lesson-progress';
import type {
  characters,
  conversations,
  corrections,
  domains,
  evaluations,
  scenarioGoals,
  scenarios,
  sessions,
  situations,
  vocabulary,
} from '@/src/schema';

export type Jsonify<T> =
  T extends Date ? string
    : T extends readonly (infer U)[] ? Jsonify<U>[]
      : T extends object ? { [K in keyof T]: Jsonify<T[K]> }
        : T;

export type SessionDto = Jsonify<typeof sessions.$inferSelect>;
export type ScenarioDto = Jsonify<typeof scenarios.$inferSelect>;
export type SituationDto = Jsonify<typeof situations.$inferSelect>;
export type DomainDto = Jsonify<typeof domains.$inferSelect>;
/**
 * Legacy UI compatibility field.
 *
 * The current characters table/API expose one `personality` string, not a
 * traits array. Keep this optional field only so the pre-existing avatar
 * presentation can remain type-safe if a future response supplies traits;
 * current API responses intentionally do not populate it.
 */
export type CharacterDto = Jsonify<typeof characters.$inferSelect> & {
  personalityTraits?: string[];
};
export type VocabularyDto = Jsonify<typeof vocabulary.$inferSelect>;
export type GoalDto = Jsonify<typeof scenarioGoals.$inferSelect>;
export type EvaluationDto = Jsonify<typeof evaluations.$inferSelect>;
export type CorrectionDto = Jsonify<typeof corrections.$inferSelect>;
export type ConversationDto = Jsonify<typeof conversations.$inferSelect> & {
  corrections: CorrectionDto[];
};

export interface GoalCompletionDto {
  id?: number;
  conversationId?: number | null;
  scenarioGoalId?: number;
  achieved?: boolean;
  evidenceNote?: string | null;
  goalText: string;
  goalType?: string;
  sequenceOrder: number;
}

export type { NextLessonTarget } from '@/lib/courses/lesson-progress';

export interface SessionDetailResponse {
  success: true;
  session: SessionDto;
  nextLesson: NextLessonTarget | null;
  scenario: ScenarioDto | null;
  situation: SituationDto | null;
  domain: DomainDto | null;
  character: CharacterDto | null;
  selectedAvatar: AvatarSource | null;
  vocabulary: VocabularyDto[];
  goals: GoalDto[];
  conversations: ConversationDto[];
  evaluation: EvaluationDto | null;
  goalCompletions: GoalCompletionDto[];
  avgPronunciationScore: number | null;
  newWordsCount: number | null;
}

export interface SharedSessionResponse {
  success: true;
  readOnly: true;
  session: Pick<SessionDto, 'id' | 'sessionNumber' | 'status' | 'totalTurns' | 'startedAt' | 'completedAt'>;
  scenario: Pick<
    ScenarioDto,
    | 'title'
    | 'context'
    | 'difficulty'
    | 'domain'
    | 'aiCharacterName'
    | 'aiCharacterRole'
    | 'userCharacterName'
    | 'userCharacterRole'
  >;
  conversations: ConversationDto[];
  evaluation: EvaluationDto | null;
  goalCompletions: GoalCompletionDto[];
}

export interface StreamAnalysis {
  messageTarget?: string;
  messageNative?: string;
  messagePhonetic?: string | null;
  emotionTone?: string;
  gestureHint?: string;
  corrections: CorrectionItem[];
  suggestedReplies: string[];
  goalsAddressedThisTurn?: number[];
  scenarioComplete?: boolean;
}

export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'text_done'; fullText: string }
  | { type: 'gesture'; gesture: string }
  | { type: 'phase_transition'; fromPhase: string; toPhase: string; message?: string }
  | { type: 'retry'; analysis: StreamAnalysis }
  | {
      type: 'done';
      fullText?: string;
      phase: string;
      analysis: StreamAnalysis;
      celebration?: boolean;
      celebrationVariant?: string;
      compositeScore?: number;
      passed?: boolean;
      xpGained?: number;
      newStreak?: number;
    }
  | { type: 'error'; code?: string; message: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasAnalysis(value: unknown): value is StreamAnalysis {
  if (!isRecord(value)) return false;
  return Array.isArray(value.corrections) && Array.isArray(value.suggestedReplies);
}

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'token':
      return hasString(value, 'text');
    case 'text_done':
      return hasString(value, 'fullText');
    case 'gesture':
      return hasString(value, 'gesture');
    case 'phase_transition':
      return hasString(value, 'fromPhase') && hasString(value, 'toPhase')
        && (value.message === undefined || typeof value.message === 'string');
    case 'retry':
      return hasAnalysis(value.analysis);
    case 'done':
      return hasString(value, 'phase') && hasAnalysis(value.analysis);
    case 'error':
      return hasString(value, 'message');
    default:
      return false;
  }
}

export function isSessionDetailResponse(value: unknown): value is SessionDetailResponse {
  if (!isRecord(value) || value.success !== true || !isRecord(value.session)) return false;
  return typeof value.session.id === 'number'
    && typeof value.session.status === 'string'
    && Array.isArray(value.goals)
    && Array.isArray(value.conversations)
    && Array.isArray(value.goalCompletions)
    && Array.isArray(value.vocabulary);
}

export function isSharedSessionResponse(value: unknown): value is SharedSessionResponse {
  if (!isRecord(value) || value.success !== true || value.readOnly !== true) return false;
  return isRecord(value.session)
    && typeof value.session.id === 'number'
    && isRecord(value.scenario)
    && typeof value.scenario.title === 'string'
    && Array.isArray(value.conversations)
    && Array.isArray(value.goalCompletions);
}
