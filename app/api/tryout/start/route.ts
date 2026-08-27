import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  MAX_GUEST_TURNS,
  TRYOUT_COOKIE,
  TRYOUT_SESSION_COOKIE,
  checkTryoutGate,
  clientIp,
  isLiveTryoutId,
  issueTryoutId,
  readSessionCookieValue,
  setSessionCookie,
} from '@/lib/tryout/gate';

export const runtime = 'nodejs';

/**
 * Opens a guest tryout.
 *
 * Two jobs, both of which have to happen before a single token is generated:
 * check the 24-hour gate, and mint the server-side id the turn budget is
 * counted against. The id is the fix for `MAX_GUEST_TURNS` having trusted the
 * client-supplied `history` — a guest could reset their budget by posting an
 * empty array.
 *
 * The id goes back as an httpOnly signed cookie and is never returned in the
 * body: if the client can name its own id, it can mint a fresh 8-turn
 * allowance whenever it likes, which is the same hole in a different coat.
 * An existing cookie is reused when the server still recognises it, so
 * navigating the mode chooser → voice keeps one budget, while a stale id from
 * an expired preview gets a clean one rather than half a turn allowance.
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const ip = clientIp(req);

  const gate = await checkTryoutGate(cookieStore.get(TRYOUT_COOKIE)?.value, ip);
  if (gate.blocked) {
    return NextResponse.json(
      { blocked: true, reason: gate.reason, retryAfterMs: gate.retryAfterMs },
      { status: 200 },
    );
  }

  const existing = readSessionCookieValue(cookieStore.get(TRYOUT_SESSION_COOKIE)?.value);
  const tryoutId = existing && (await isLiveTryoutId(existing)) ? existing : await issueTryoutId();

  const res = NextResponse.json({ blocked: false, maxTurns: MAX_GUEST_TURNS });
  setSessionCookie(res, tryoutId);
  return res;
}
