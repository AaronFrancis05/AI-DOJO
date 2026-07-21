import { Redis } from '@upstash/redis';

const TTL = {
  AVATARS: 300,        // 5 min
  SESSION: 60,         // 1 min (session state changes often)
  SCENARIO: 3600,      // 1 hr (scenarios never change)
  VOCABULARY: 3600,    // 1 hr
  GOALS: 3600,         // 1 hr
  SITUATION: 3600,     // 1 hr
  CHARACTER: 3600,     // 1 hr
  DOMAIN: 3600,        // 1 hr
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
  session: (sessionId: number) => key('session', sessionId),
  scenario: (scenarioId: number) => key('scenario', scenarioId),
  vocabulary: (scenarioId: number) => key('vocab', scenarioId),
  goals: (scenarioId: number) => key('goals', scenarioId),
  situation: (situationId: number) => key('situation', situationId),
  character: (characterId: number) => key('character', characterId),
  domain: (domainId: number) => key('domain', domainId),
};

export { TTL };
