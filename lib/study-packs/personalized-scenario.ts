/**
 * Learner-owned scenarios (PLAN.md 3.4): prompt and validation.
 *
 * A scenario written for one learner, from their occupation, interests, open
 * weak points and an optional topic, and stored with `scenarios.ownerUserId`
 * so it never enters the shared library. The rows follow the same layout as
 * the library's (lib/localization.ts): the base row in English, the
 * target-language scene in `scenario_localizations` when the target is not
 * English, and the native-language explanation in the (target, native)
 * tables. Vocabulary reuses parseGeneratedVocab, the validator the
 * custom-domain builder uses.
 */

import { parseGeneratedVocab, type VocabRow } from '@/lib/roleplay/generated-vocab';

export const MAX_TOPIC_LENGTH = 200;
const MIN_GOALS = 2;
const MAX_GOALS = 4;
const MIN_VOCAB = 3;
const MAX_VOCAB = 8;

export interface PersonalizedScenarioInput {
  targetLanguage: string;
  targetLanguageName: string;
  nativeLanguage: string;
  nativeLanguageName: string;
  difficulty: string;
  occupation: string | null;
  interests: string[];
  weakPoints: { category: string; pattern: string }[];
  topic: string | null;
}

export interface SceneText {
  title: string;
  context: string;
  learningGoals: string;
  aiCharacterRole: string;
  userCharacterRole: string;
}

export interface PersonalizedScenarioDraft {
  /** Base row, English. */
  base: SceneText & { aiCharacterName: string; businessType: string };
  /** The scene in the target language; null when the target is English (the base is the scene). */
  targetScene: SceneText | null;
  /** The scene explained in the native language; null when native and target are the same. */
  native: SceneText | null;
  goals: { goalText: string; goalNative: string | null; targetPhrase: string }[];
  /** `translation` and `usageTip` are in the native language. */
  vocabulary: VocabRow[];
}

const needsTargetScene = (input: { targetLanguage: string }) => input.targetLanguage !== 'en';
const needsNative = (input: { targetLanguage: string; nativeLanguage: string }) => input.nativeLanguage !== input.targetLanguage;

export function buildPersonalizedScenarioPrompt(input: PersonalizedScenarioInput): string {
  const target = input.targetLanguageName;
  const native = input.nativeLanguageName;
  const about = [
    input.occupation ? `Works as: ${input.occupation}` : null,
    input.interests.length > 0 ? `Interests: ${input.interests.join(', ')}` : null,
    input.topic ? `They asked to practise: ${input.topic}` : null,
  ].filter(Boolean).join('\n') || 'No profile given: pick an everyday situation most adults meet.';
  const weak = input.weakPoints.length > 0
    ? input.weakPoints.map((w) => `- [${w.category}] ${w.pattern}`).join('\n')
    : '(none recorded yet)';
  const scene = `{"title": "...", "context": "2 to 4 sentences setting the scene", "learningGoals": "the goals as one line each, newline-separated", "aiCharacterRole": "...", "userCharacterRole": "..."}`;

  return `You design one role-play scenario for a ${input.difficulty} learner of ${target} whose native language is ${native}. It must be about THEIR life, so it is worth practising.

About the learner:
${about}

Their weak points, which the scenario should make them use:
${weak}

Rules:
- A realistic, culture-neutral situation with one conversation partner played by the AI.
- ${MIN_GOALS} to ${MAX_GOALS} goals the learner completes by speaking; each "targetPhrase" is a short ${target} phrase that achieves it.
- ${MIN_VOCAB + 2} to ${MAX_VOCAB} vocabulary items: single ${target} words or short phrases (never sentences) the learner will need.
- Match the ${input.difficulty} level.

Return JSON:
{
  "base": {"aiCharacterName": "a first name", "businessType": "the setting in 1 to 3 words", ...the scene fields in English: ${scene}},
  ${needsTargetScene(input) ? `"targetScene": the same scene written in ${target}: ${scene},` : '"targetScene": null,'}
  ${needsNative(input) ? `"native": the same scene explained in ${native}: ${scene},` : '"native": null,'}
  "goals": [{"goalText": "the goal in English", "goalNative": ${needsNative(input) ? `"the goal in ${native}"` : 'null'}, "targetPhrase": "${target} phrase"}],
  "vocabulary": [{"targetText": "${target} word or phrase", "phonetic": "romanized pronunciation for Japanese, else empty string", "translation": "its meaning in ${native}", "category": "greeting, question, noun, verb, phrase...", "usageTip": "a short tip in ${native}", "formalityLevel": "casual, polite or formal"}]
}`;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseScene(value: unknown): SceneText | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const scene = {
    title: str(v.title, 120),
    context: str(v.context, 2000),
    learningGoals: str(v.learningGoals, 2000),
    aiCharacterRole: str(v.aiCharacterRole, 150),
    userCharacterRole: str(v.userCharacterRole, 150),
  };
  return scene.title && scene.context ? scene : null;
}

/** Validates the model's scenario. Throws when it is not playable. */
export function parsePersonalizedScenario(
  raw: string,
  input: Pick<PersonalizedScenarioInput, 'targetLanguage' | 'nativeLanguage'>,
): PersonalizedScenarioDraft {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('personalized scenario: not a JSON object');
  const obj = parsed as Record<string, unknown>;

  const baseScene = parseScene(obj.base);
  if (!baseScene) throw new Error('personalized scenario: missing base scene');
  const baseExtra = obj.base as Record<string, unknown>;

  const goals: PersonalizedScenarioDraft['goals'] = [];
  for (const g of Array.isArray(obj.goals) ? obj.goals : []) {
    if (!g || typeof g !== 'object') continue;
    const goal = g as Record<string, unknown>;
    const goalText = str(goal.goalText, 500);
    const targetPhrase = str(goal.targetPhrase, 200);
    if (!goalText || !targetPhrase) continue;
    goals.push({ goalText, goalNative: str(goal.goalNative, 500) || null, targetPhrase });
    if (goals.length >= MAX_GOALS) break;
  }
  if (goals.length < MIN_GOALS) throw new Error('personalized scenario: too few goals');

  const vocabulary = (Array.isArray(obj.vocabulary) ? obj.vocabulary : [])
    .map(parseGeneratedVocab)
    .filter((v): v is VocabRow => v !== null)
    // Same guard as the session vocab generator: a word or phrase, not a sentence.
    .filter((v) => !/[.!?;。！？]$/.test(v.targetText.trim()) && v.targetText.trim().split(/\s+/).length <= 6)
    .slice(0, MAX_VOCAB);
  if (vocabulary.length < MIN_VOCAB) throw new Error('personalized scenario: too little vocabulary');

  return {
    base: {
      ...baseScene,
      // The base row always carries goals; fall back to the goal list itself.
      learningGoals: baseScene.learningGoals || goals.map((g) => g.goalText).join('\n'),
      aiCharacterName: str(baseExtra.aiCharacterName, 80) || 'Alex',
      businessType: str(baseExtra.businessType, 80) || 'Personal',
      aiCharacterRole: baseScene.aiCharacterRole || 'Conversation partner',
      userCharacterRole: baseScene.userCharacterRole || 'Yourself',
    },
    targetScene: needsTargetScene(input) ? parseScene(obj.targetScene) : null,
    native: needsNative(input) ? parseScene(obj.native) : null,
    goals,
    vocabulary,
  };
}
