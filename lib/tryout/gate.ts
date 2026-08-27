import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { cacheGet, cacheSet, cacheKeys, isCacheConfigured, rateLimitIncrement, TTL } from '@/lib/cache';

/**
 * The 24-hour guest tryout gate.
 *
 * One *completed* tryout per guest per 24h, enforced two ways because either
 * one alone is trivially defeated:
 *
 *  - an httpOnly signed device cookie, which is the per-device limit of
 *    exactly one and survives a fresh browser tab;
 *  - an IP counter, which is the backstop for a guest who clears cookies or
 *    opens a private window. It is deliberately NOT 1: a university, an
 *    office and every mobile carrier NAT put many genuine first-time
 *    visitors behind one address, and a limit of 1 there blocks real
 *    learners rather than the abuse it is aimed at.
 *
 * Signing up doesn't shorten the window — it makes it irrelevant, because a
 * signed-in learner never goes through /tryout at all.
 */

/** Cookie the device gate is stored in. httpOnly — the client never reads it. */
export const TRYOUT_COOKIE = 'ai-dojo:tryout-used';

/**
 * Cookie carrying the in-flight preview's id.
 *
 * The id is the budget, so it cannot travel in the request body: a guest who
 * can choose their own id can mint a fresh 8-turn allowance whenever they
 * like, which is the same hole as trusting the client's `history` array in a
 * different coat. httpOnly and signed, so it is issued by the server and only
 * ever echoed back by the browser.
 */
export const TRYOUT_SESSION_COOKIE = 'ai-dojo:tryout-session';

const COOKIE_MAX_AGE_SECONDS = TTL.TRYOUT_DAILY;

/** Completed tryouts allowed from one IP in the rolling 24h window. */
export const MAX_TRYOUT_COMPLETIONS_PER_IP_PER_DAY = 5;

/** Requests to /api/tryout/turn allowed from one IP in an hour. */
export const MAX_TRYOUT_REQUESTS_PER_IP_PER_HOUR = 36;

/** User turns in one tryout, counted server-side against an issued id. */
export const MAX_GUEST_TURNS = 8;

export type TryoutBlockReason = 'device' | 'ip';

export interface TryoutGateStatus {
  blocked: boolean;
  reason?: TryoutBlockReason;
  /** Milliseconds until the guest may try again. Null when unknown. */
  retryAfterMs: number | null;
}

function secret(): string {
  // The gate is anti-abuse, not authentication — reusing the auth cookie
  // secret keeps one secret to rotate rather than inventing a second.
  const value = process.env.TRYOUT_COOKIE_SECRET || process.env.NEON_AUTH_COOKIE_SECRET;
  if (!value) throw new Error('Neither TRYOUT_COOKIE_SECRET nor NEON_AUTH_COOKIE_SECRET is set');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/**
 * `<completedAtMs>.<hmac>` — the timestamp has to travel in the cookie so the
 * blocked screen can show a real countdown rather than a flat "come back
 * tomorrow", and the signature is what stops a guest from editing it.
 */
export function issueUsedCookieValue(now = Date.now()): string {
  const payload = String(now);
  return `${payload}.${sign(payload)}`;
}

/** The completion time carried by a valid cookie, or null if absent/forged. */
export function readUsedCookieValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const [payload, mac] = raw.split('.');
  if (!payload || !mac) return null;

  const expected = sign(payload);
  // Both are hex of the same length, so a length mismatch is already a
  // mismatch — timingSafeEqual would throw on it.
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) return null;

  const at = Number(payload);
  return Number.isFinite(at) ? at : null;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

/**
 * Reads the gate without consuming anything. Called on tryout entry and on
 * every turn, so it must stay side-effect free — `markTryoutCompleted` is the
 * only thing that writes.
 */
export async function checkTryoutGate(
  cookieValue: string | undefined,
  ip: string,
): Promise<TryoutGateStatus> {
  const usedAt = readUsedCookieValue(cookieValue);
  if (usedAt !== null) {
    const elapsed = Date.now() - usedAt;
    if (elapsed < TTL.TRYOUT_DAILY * 1000) {
      return { blocked: true, reason: 'device', retryAfterMs: TTL.TRYOUT_DAILY * 1000 - elapsed };
    }
  }

  const completions = (await cacheGet<number>(cacheKeys.tryoutDailyGate(ip))) ?? 0;
  if (completions >= MAX_TRYOUT_COMPLETIONS_PER_IP_PER_DAY) {
    return { blocked: true, reason: 'ip', retryAfterMs: null };
  }

  return { blocked: false, retryAfterMs: null };
}

/**
 * Records a finished tryout: sets the device cookie on the response and
 * increments the IP's daily counter.
 *
 * `rateLimitIncrement` rather than read-then-write — a read-then-write
 * counter is not a limit, and this one is the only thing standing between a
 * cookie-clearing guest and an unmetered LLM relay.
 */
export async function markTryoutCompleted(res: NextResponse, ip: string): Promise<void> {
  res.cookies.set(TRYOUT_COOKIE, issueUsedCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  // The spent preview's id has no further use, and leaving it around only
  // gives a second thing to reason about when the gate is next checked.
  res.cookies.delete(TRYOUT_SESSION_COOKIE);
  await rateLimitIncrement(cacheKeys.tryoutDailyGate(ip), TTL.TRYOUT_DAILY);
}

/**
 * Issues a server-side tryout id and opens its turn budget.
 *
 * The budget used to be derived from the client-supplied `history` array,
 * which meant a guest could reset it by posting an empty history. It now
 * lives in Redis under an id the client cannot mint.
 */
export async function issueTryoutId(): Promise<string> {
  const id = randomUUID();
  await cacheSet(cacheKeys.tryoutTurns(id), 0, TTL.TRYOUT_SESSION);
  return id;
}

/** `<tryoutId>.<hmac>` — the value that goes in `TRYOUT_SESSION_COOKIE`. */
export function issueSessionCookieValue(tryoutId: string): string {
  return `${tryoutId}.${sign(tryoutId)}`;
}

/** The tryout id carried by a valid session cookie, or null if absent/forged. */
export function readSessionCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, mac] = raw.split('.');
  if (!id || !mac) return null;

  const expected = sign(id);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) return null;

  return id;
}

/** Puts an issued tryout id on the response as an httpOnly signed cookie. */
export function setSessionCookie(res: NextResponse, tryoutId: string): void {
  res.cookies.set(TRYOUT_SESSION_COOKIE, issueSessionCookieValue(tryoutId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL.TRYOUT_SESSION,
  });
}

/**
 * Whether an id the browser echoed back is one this server still recognises.
 *
 * With no Redis configured there is nothing to have issued against, so a
 * correctly signed id is taken at face value — the same concession
 * `consumeTurn` makes, and the reason `isCacheConfigured()` exists.
 */
export async function isLiveTryoutId(tryoutId: string): Promise<boolean> {
  if (!isCacheConfigured()) return true;
  return (await cacheGet<number>(cacheKeys.tryoutTurns(tryoutId))) !== null;
}

export interface TurnBudget {
  /** User turns taken *before* this one. */
  priorUserTurns: number;
  /** The id is unknown or its window expired. */
  expired: boolean;
  /** This turn takes the guest past MAX_GUEST_TURNS. */
  exhausted: boolean;
}

/**
 * Consumes one user turn from an issued tryout id, or reads the budget
 * without consuming when `consume` is false (the greeting turn).
 */
export async function consumeTurn(tryoutId: string, consume: boolean): Promise<TurnBudget> {
  const key = cacheKeys.tryoutTurns(tryoutId);

  if (!consume) {
    const current = await cacheGet<number>(key);
    if (current === null) {
      // Absent means the id was never issued, or its hour has passed. When
      // there is no Redis at all there is nothing to have issued against, so
      // the id is taken at face value and the budget starts at zero.
      return { priorUserTurns: 0, expired: isCacheConfigured(), exhausted: false };
    }
    return { priorUserTurns: Number(current), expired: false, exhausted: false };
  }

  const count = await rateLimitIncrement(key, TTL.TRYOUT_SESSION);
  if (count === null) {
    return { priorUserTurns: 0, expired: isCacheConfigured(), exhausted: false };
  }
  // `incr` on a missing key starts at 1 rather than failing, so a count of 1
  // is ambiguous between "first turn" and "expired id, silently restarted".
  // The greeting path above is what catches an expired id; here the worst
  // case is one extra free turn, which is not worth a second round trip.
  return { priorUserTurns: count - 1, expired: false, exhausted: count > MAX_GUEST_TURNS };
}
