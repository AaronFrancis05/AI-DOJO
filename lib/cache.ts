import { Redis } from '@upstash/redis';

const TTL = {
AVATARS: 300,        // 5 min
USER_PROFILE: 300,   // 5 min (name/country change rarely but can be edited in settings)
SESSION: 60,         // 1 min (session state changes often)
  SCENARIO: 3600,      // 1 hr (scenarios never change)
  VOCABULARY: 3600,    // 1 hr
  GOALS: 3600,         // 1 hr
  SITUATION: 3600,     // 1 hr
  CHARACTER: 3600,     // 1 hr
  DOMAIN: 3600,        // 1 hr
  TRYOUT_RATE_LIMIT: 3600, // 1 hr window for guest tryout throttling
  TRYOUT_DAILY: 86400, // 24 hr window for the one-completed-tryout-per-guest gate
  TRYOUT_SESSION: 3600, // 1 hr — a preview is 2-3 min; this only has to outlive one sitting
  SPEECH_TOKEN: 540,   // 9 min (Azure issueToken lifetime is 10 min)
  PROFICIENCY: 300,    // 5 min (only changes when a session completes)
  LANGUAGE_CATALOG: 3600, // 1 hr — languages change rarely, and every admin write invalidates the key
} as const;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

/**
 * Whether Redis is configured at all.
 *
 * `rateLimitIncrement` returns `null` both when Redis is absent (local dev
 * without Upstash credentials) and when a configured Redis errors. A gate on
 * a billed resource has to tell those apart: an outage of a configured cache
 * must deny, but a developer who never set the credentials should not find
 * the whole feature bricked.
 */
export function isCacheConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get<T>(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, { ex: ttl });
  } catch {
    // fail silently — cache is a perf optimisation, not critical
  }
}

/**
 * Atomically increments a counter and returns its new value, or `null` when
 * Redis is unavailable or errors.
 *
 * Read-then-write with `cacheGet`/`cacheSet` is not a rate limit: concurrent
 * requests all read the same count and all write count+1, so a burst passes
 * a limit of N with far more than N requests. Callers that gate a *billed*
 * resource must treat `null` as "deny" — a cache outage is not a licence to
 * hand out an unmetered relay.
 */
export async function rateLimitIncrement(key: string, ttl: number): Promise<number | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const count = await r.incr(key);
    // Only the request that created the key sets the window, so the window
    // rolls forward from the first request rather than the most recent one.
    if (count === 1) await r.expire(key, ttl);
    return count;
  } catch {
    return null;
  }
}

export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // fail silently
  }
}

function key(prefix: string, ...parts: (string | number)[]): string {
  return `ai-dojo:${prefix}:${parts.join(':')}`;
}

export const cacheKeys = {
  userAvatars: (userId: string) => key('avatars', userId),
  userProfile: (userId: string) => key('user-profile', userId),
  learnerProficiency: (userId: string, lang: string) => key('proficiency', `${userId}:${lang}`),
  session: (sessionId: number) => key('session', sessionId),
  scenario: (scenarioId: number) => key('scenario', scenarioId),
  scenarioLocalization: (scenarioId: number, lang: string) => key('scenario-loc', scenarioId, lang),
  vocabulary: (scenarioId: number, lang: string) => key('vocab', scenarioId, lang),
  vocabLocalizations: (scenarioId: number, lang: string) => key('vocab-loc', scenarioId, lang),
  goals: (scenarioId: number) => key('goals', scenarioId),
  goalLocalizations: (scenarioId: number, lang: string) => key('goal-loc', scenarioId, lang),
  situation: (situationId: number) => key('situation', situationId),
  situationLocalization: (situationId: number, lang: string) => key('situation-loc', situationId, lang),
  character: (characterId: number) => key('character', characterId),
  domain: (domainId: number) => key('domain', domainId),
  tryoutRateLimit: (ip: string) => key('tryout-rate-limit', ip),
  /** Completed tryouts from one IP inside the rolling 24h window. */
  tryoutDailyGate: (ip: string) => key('tryout-daily', ip),
  /** Server-side turn budget for one issued tryout id. */
  tryoutTurns: (tryoutId: string) => key('tryout-turns', tryoutId),
  speechToken: (region: string) => key('speech-token', region),
  /** The whole `languages` table — one key, because it is always read whole. */
  languageCatalog: () => key('language-catalog', 'v1'),
};

export { TTL };
