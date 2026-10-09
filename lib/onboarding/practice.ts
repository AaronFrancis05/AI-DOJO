import { db } from '@/src/db';
import { domains, scenarios, situations, vocabulary } from '@/src/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getTargetLangConfig, getNativeLangName, BASE_CONTENT_LANGUAGE } from '@/lib/language';
import {
  applySituationLocalization,
  getTargetSituationLocalization,
} from '@/lib/localization';
import { cacheDel, cacheGet, cacheKeys, cacheSet, TTL } from '@/lib/cache';
import { TRYOUT_ICEBREAKER_PHRASES } from '@/lib/tryout/icebreaker-phrases';
import type { PracticeSituation } from '@/lib/onboarding/practice-shared';

export type { PracticeSituation, PracticeSurface } from '@/lib/onboarding/practice-shared';
export { practiceChatStartsOpen, practiceSurface } from '@/lib/onboarding/practice-shared';

/** Icebreaker phrases (and user turns) in the in-wizard sample, greeting excluded. */
export const MAX_ONBOARDING_USER_TURNS = 5;

/** Requests to /api/onboarding/turn allowed from one identity in an hour. */
export const MAX_ONBOARDING_REQUESTS_PER_HOUR = 36;

export type PracticePhase = 'icebreaker' | 'closing';

export interface PracticePhrase {
  /** English meaning the model teaches from, same as tryout. */
  gloss: string;
  hint: string;
  /** Exact form to teach when we already have it in the target language. */
  targetText?: string;
}

export interface PracticeSession {
  situation: PracticeSituation;
  phrases: PracticePhrase[];
}

export interface PracticePhaseInfo {
  phase: PracticePhase;
  wordIndex: number;
  nextWordIndex: number | null;
}

/**
 * Picks one situation in the domain: matching `skillLevel` first, otherwise
 * the domain's first active row. Phrases come from that scenario's vocabulary
 * so the sitting is an icebreaker, not the scene itself.
 */
export async function resolvePracticeSituation(
  domainId: number,
  level: string,
  targetLanguage: string,
): Promise<PracticeSession | null> {
  const [domain] = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.isActive, true)))
    .limit(1);
  if (!domain) return null;

  const rows = await db
    .select({
      id: situations.id,
      title: situations.title,
      context: situations.context,
      learningGoals: situations.learningGoals,
      skillLevel: situations.skillLevel,
      displayOrder: situations.displayOrder,
      scenarioId: scenarios.id,
      aiCharacterName: scenarios.aiCharacterName,
      aiCharacterRole: scenarios.aiCharacterRole,
    })
    .from(situations)
    .leftJoin(scenarios, eq(scenarios.situationId, situations.id))
    .where(and(eq(situations.domainId, domainId), eq(situations.isActive, true)))
    .orderBy(asc(situations.displayOrder), asc(scenarios.displayOrder));

  if (rows.length === 0) return null;

  const wanted = level || 'beginner';
  const matched = rows.find((r) => r.skillLevel === wanted) ?? rows[0];
  const loc = await getTargetSituationLocalization(matched.id, targetLanguage);
  const localized = applySituationLocalization(
    {
      title: matched.title,
      context: matched.context,
      learningGoals: matched.learningGoals,
      focusPills: null,
    },
    loc,
  );

  const situation: PracticeSituation = {
    id: matched.id,
    title: localized.title,
    context: localized.context,
    learningGoals: localized.learningGoals,
    skillLevel: matched.skillLevel,
    characterName: matched.aiCharacterName || 'Sam',
    characterRole: matched.aiCharacterRole || 'Conversation partner',
    domainName: domain.name,
  };

  const phrases = await loadPracticePhrases(matched.scenarioId, targetLanguage);
  return { situation, phrases };
}

async function loadPracticePhrases(
  scenarioId: number | null,
  targetLanguage: string,
): Promise<PracticePhrase[]> {
  if (!scenarioId) {
    return TRYOUT_ICEBREAKER_PHRASES.map((p) => ({ ...p }));
  }

  const languages = targetLanguage === BASE_CONTENT_LANGUAGE ? [BASE_CONTENT_LANGUAGE] : [BASE_CONTENT_LANGUAGE, targetLanguage];
  const rows = await db
    .select({
      targetText: vocabulary.targetText,
      translation: vocabulary.translation,
      usageTip: vocabulary.usageTip,
      languageCode: vocabulary.languageCode,
    })
    .from(vocabulary)
    .where(and(eq(vocabulary.scenarioId, scenarioId), inArray(vocabulary.languageCode, languages)))
    .orderBy(asc(vocabulary.id));

  const preferred = rows.filter((r) => r.languageCode === targetLanguage);
  const source = preferred.length > 0 ? preferred : rows.filter((r) => r.languageCode === BASE_CONTENT_LANGUAGE);
  const picked = source.slice(0, MAX_ONBOARDING_USER_TURNS);
  if (picked.length === 0) {
    return TRYOUT_ICEBREAKER_PHRASES.map((p) => ({ ...p }));
  }

  return picked.map((r) => ({
    gloss: r.translation,
    hint: r.usageTip?.trim() || r.translation,
    ...(r.languageCode === targetLanguage ? { targetText: r.targetText } : {}),
  }));
}

/**
 * Which prompt the next reply uses.
 *
 * Advancement is by user-turn count, same as tryout. There is no scene after
 * the last phrase — that reply is the closing.
 */
export function practicePhase(
  priorUserTurns: number,
  isGreeting: boolean,
  phraseCount: number,
): PracticePhaseInfo {
  const count = Math.max(1, phraseCount);
  if (isGreeting) {
    return { phase: 'icebreaker', wordIndex: 0, nextWordIndex: null };
  }
  const wordIndex = Math.min(priorUserTurns, count - 1);
  const nextWordIndex = priorUserTurns + 1 < count ? priorUserTurns + 1 : null;
  if (nextWordIndex !== null) {
    return { phase: 'icebreaker', wordIndex, nextWordIndex };
  }
  return { phase: 'closing', wordIndex, nextWordIndex: null };
}

export function buildPracticeSystemInstruction(input: {
  targetLanguage: string;
  nativeLanguage: string;
  situation: PracticeSituation;
  phrases: PracticePhrase[];
  phase: PracticePhase;
  wordIndex: number;
  nextWordIndex: number | null;
  isGreeting: boolean;
}): string {
  const targetLangName = getTargetLangConfig(input.targetLanguage).name;
  const nativeLangName = getNativeLangName(input.nativeLanguage);
  const sameLanguage = input.targetLanguage === input.nativeLanguage;
  const { situation, phrases } = input;
  const count = Math.max(1, phrases.length);

  const format = `The learner's native language is ${nativeLangName}. Always reply in ${targetLangName}.${
    sameLanguage
      ? ` Target and native are the same language — set replyNative to an empty string; do not repeat the reply.`
      : ` Also provide a ${nativeLangName} translation so the learner can follow along.`
  }

Return strictly a JSON object matching this schema, with no extra commentary:
{
  "replyTarget": "Your reply in ${targetLangName}",
  "replyNative": "${sameLanguage ? '' : `The same reply translated into ${nativeLangName}`}"
}`;

  const lead = `You are ${situation.characterName}, ${situation.characterRole}.
This is a short icebreaker inside onboarding — you are teaching a handful of essential ${situation.domainName.toLowerCase()} phrases the learner will need later. You are NOT playing the scene yet. Do not order food, check in, or otherwise start the situation. Keep every reply to 2-4 sentences, warm, and easy enough for a first-time learner.

The learner cannot take a turn until you ask them to. Never end a reply on feedback alone.`;

  const phraseLine = (p: PracticePhrase, n: number) => {
    const exact = p.targetText ? ` Teach this exact ${targetLangName} form: "${p.targetText}".` : '';
    return `phrase ${n} of ${count}: "${p.gloss}" (${p.hint}).${exact}`;
  };

  const current = phrases[input.wordIndex] ?? phrases[0];

  if (input.isGreeting) {
    return `${lead}

Teach ${phraseLine(current, 1)}
Say the ${targetLangName} phrase, give its ${nativeLangName} meaning, and ask the learner to try saying it. Do not teach any other phrase yet.

${format}`;
  }

  if (input.phase === 'closing' || input.nextWordIndex === null) {
    return `${lead}

The learner just attempted the last phrase (${count} of ${count}): "${current.gloss}".
Give a very brief bit of feedback on their attempt (one short clause — do not ask them to retry).
Then give a warm, brief closing (1-2 sentences): acknowledge what they did and encourage them to keep going in the app. Do not start the scene. Do not teach a new phrase.

${format}`;
  }

  const next = phrases[input.nextWordIndex];
  if (!next) {
    return `${lead}

The learner just attempted the last phrase (${count} of ${count}): "${current.gloss}".
Give a very brief bit of feedback on their attempt (one short clause — do not ask them to retry).
Then give a warm, brief closing (1-2 sentences): acknowledge what they did and encourage them to keep going in the app. Do not start the scene. Do not teach a new phrase.

${format}`;
  }

  return `${lead}

The learner just attempted ${phraseLine(current, input.wordIndex + 1)}
Give a very brief bit of feedback on their attempt (one short clause — do not ask them to retry).
Then immediately teach ${phraseLine(next, input.nextWordIndex + 1)}
Say the ${targetLangName} phrase, give its ${nativeLangName} meaning, and ask them to try saying it.

${format}`;
}

export async function resetPracticeTurns(budgetId: string): Promise<void> {
  await cacheDel(cacheKeys.onboardingTurns(budgetId));
}

/**
 * Server-side turn budget for one onboarding sample.
 *
 * Redis when configured, otherwise the posted history — same fallback tryout
 * uses locally. Greeting does not consume a turn; `restart` clears the count
 * so changing domain/level and coming back is a fresh sample.
 */
export async function consumePracticeTurn(
  budgetId: string,
  isUserTurn: boolean,
  historyUserTurns: number,
): Promise<{ priorUserTurns: number; exhausted: boolean }> {
  const key = cacheKeys.onboardingTurns(budgetId);
  const stored = await cacheGet<number>(key);

  if (stored === undefined || stored === null) {
    const prior = historyUserTurns;
    if (isUserTurn) {
      await cacheSet(key, prior + 1, TTL.ONBOARDING_PRACTICE);
      return { priorUserTurns: prior, exhausted: prior >= MAX_ONBOARDING_USER_TURNS };
    }
    return { priorUserTurns: prior, exhausted: prior >= MAX_ONBOARDING_USER_TURNS };
  }

  if (!isUserTurn) {
    return { priorUserTurns: stored, exhausted: stored >= MAX_ONBOARDING_USER_TURNS };
  }
  if (stored >= MAX_ONBOARDING_USER_TURNS) {
    return { priorUserTurns: stored, exhausted: true };
  }
  await cacheSet(key, stored + 1, TTL.ONBOARDING_PRACTICE);
  return { priorUserTurns: stored, exhausted: false };
}
