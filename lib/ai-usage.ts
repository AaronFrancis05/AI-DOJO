/**
 * The `ai_usage` ledger: who spent which tokens on what, and whether they may
 * spend more today.
 *
 * Every AI call attributable to a learner reports through `usageRecorder`,
 * which plugs into `GenerateOptions.onUsage` (lib/ai-providers/types.ts). The
 * quota is enforced on batch generation (study packs, personalized
 * scenarios). Live turns are recorded but never blocked here: cutting a
 * learner off mid-conversation is a plan decision, and plans arrive with
 * billing in Phase 5.
 */

import { db } from '@/src/db';
import { aiUsage } from '@/src/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { AIUsage } from '@/lib/ai-providers';

/**
 * USD per million tokens, [input, output], matched by model-id prefix
 * (longest prefix wins). List prices at the time of writing: verify them
 * against each provider's pricing page before using the ledger for a pricing
 * decision. A model without an entry still gets its tokens recorded, with a
 * NULL cost.
 */
const PRICE_PER_MTOK: Record<string, [number, number]> = {
  'gemini-2.0-flash-lite': [0.075, 0.3],
  'gemini-2.0-flash': [0.1, 0.4],
  'gemini-2.5-flash-lite': [0.1, 0.4],
  'gemini-2.5-flash': [0.3, 2.5],
  'claude-haiku-4-5': [1, 5],
  'claude-sonnet-4': [3, 15],
  'llama-3.3-70b-versatile': [0.59, 0.79],
};

const PRICE_PREFIXES = Object.keys(PRICE_PER_MTOK).sort((a, b) => b.length - a.length);

/** Cost in USD micros (USD x 1,000,000), or null for a model without a price. */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number | null {
  const prefix = PRICE_PREFIXES.find((p) => model.startsWith(p));
  if (!prefix) return null;
  const [inPrice, outPrice] = PRICE_PER_MTOK[prefix];
  // Per-MTok price x tokens / 1e6 = USD; x 1e6 = micros. The two cancel.
  return Math.round(inputTokens * inPrice + outputTokens * outPrice);
}

export type AIUsageRoute =
  | 'chat/stream'
  | 'study-pack'
  | 'scenario/personalized'
  // Hybrid tutoring (PLAN.md Phase 4). Recorded against the LEARNER the call
  // serves, so cost-per-learner includes their lessons. Not quota-gated: a
  // tutor's lesson plan or a learner's mid-lesson question must not fail
  // because of practice they did earlier that day.
  | 'lesson-plan'
  | 'lesson/explain'
  | 'lesson/captions';

/** The routes the batch quota counts and gates. Live turns are recorded but spend no quota. */
const BATCH_ROUTES: AIUsageRoute[] = ['study-pack', 'scenario/personalized'];

/** Writes one ledger row. Never throws: bookkeeping must not fail the call it describes. */
export async function recordAIUsage(userId: string | null, route: AIUsageRoute, usage: AIUsage): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId,
      route,
      provider: usage.provider,
      model: usage.model.slice(0, 100),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costMicros: costMicros(usage.model, usage.inputTokens, usage.outputTokens),
    });
  } catch (err) {
    console.warn('[ai-usage] failed to record:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * An `onUsage` callback that writes to the ledger, plus a `flush()` that
 * resolves once every write it started has settled. Await `flush()` where the
 * process may end right after the call (an Inngest step); a request handler
 * can let it run.
 */
export function usageRecorder(userId: string | null, route: AIUsageRoute) {
  const pending: Promise<void>[] = [];
  return {
    onUsage: (usage: AIUsage) => {
      pending.push(recordAIUsage(userId, route, usage));
    },
    flush: async () => {
      await Promise.all(pending);
    },
  };
}

/**
 * Daily token budget for batch generation, per `users.tier`. Placeholders
 * until Phase 5 prices the plans: a study pack is two calls of a few thousand
 * tokens each, so the free tier covers several sessions a day.
 */
export const DAILY_TOKEN_QUOTA: Record<string, number> = {
  free: 60_000,
  premium: 600_000,
};

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Batch-generation tokens (input + output) the learner has used since midnight UTC. */
export async function batchTokensUsedToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)::int` })
    .from(aiUsage)
    .where(and(
      eq(aiUsage.userId, userId),
      inArray(aiUsage.route, BATCH_ROUTES),
      gte(aiUsage.createdAt, startOfTodayUtc()),
    ));
  return row?.total ?? 0;
}

/** Whether the learner may start another batch generation today. An unknown tier gets the free budget. */
export async function hasBatchQuota(userId: string, tier: string | null | undefined): Promise<boolean> {
  const limit = DAILY_TOKEN_QUOTA[tier ?? 'free'] ?? DAILY_TOKEN_QUOTA.free;
  return (await batchTokensUsedToday(userId)) < limit;
}

/**
 * Azure speech translation, USD per audio hour (list price at the time of
 * writing — verify before any pricing decision). Captions are billed by audio
 * time, not tokens (PLAN.md 4.8 part 4).
 */
const SPEECH_TRANSLATION_USD_PER_HOUR = 2.5;

/**
 * Records live-caption audio time. Captions have no tokens, so the row carries
 * the audio SECONDS in `inputTokens` (and 0 output) — read the route, not the
 * column name, when aggregating. Never throws.
 */
export async function recordCaptionSeconds(userId: string, seconds: number): Promise<void> {
  const whole = Math.max(0, Math.round(seconds));
  if (whole === 0) return;
  try {
    await db.insert(aiUsage).values({
      userId,
      route: 'lesson/captions' satisfies AIUsageRoute,
      provider: 'azure',
      model: 'speech-translation',
      inputTokens: whole,
      outputTokens: 0,
      costMicros: Math.round((whole / 3600) * SPEECH_TRANSLATION_USD_PER_HOUR * 1_000_000),
    });
  } catch (err) {
    console.warn('[ai-usage] failed to record caption time:', err instanceof Error ? err.message : String(err));
  }
}

/** Caption seconds this learner has used on one day (UTC), for the per-level cap. */
export async function captionSecondsToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int` })
    .from(aiUsage)
    .where(and(
      eq(aiUsage.userId, userId),
      eq(aiUsage.route, 'lesson/captions'),
      gte(aiUsage.createdAt, startOfTodayUtc()),
    ));
  return row?.total ?? 0;
}
