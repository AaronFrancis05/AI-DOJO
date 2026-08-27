import { createNeonAuth } from '@neondatabase/auth/next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { syncUser } from './sync-user';
import { SESSION_DATA_COOKIE, SESSION_TOKEN_COOKIE } from './cookies';
import { satisfiesRole, toUserRole, type UserRole } from './roles';
import { db } from '@/src/db';
import { users } from '@/src/schema';

function getConfig() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl) throw new Error('NEON_AUTH_BASE_URL is not set');
  if (!cookieSecret) throw new Error('NEON_AUTH_COOKIE_SECRET is not set');

  return { baseUrl, cookies: { secret: cookieSecret, sameSite: 'lax' as const } };
}

export { getConfig };

export const auth = createNeonAuth(getConfig());

export async function getAuthUser() {
  const { data: session } = await auth.getSession();
  const user = session?.user ?? null;
  if (user) {
    const dbUserId = await syncUser({
      id: user.id,
      email: user.email!,
      name: user.name!,
    }).catch((err) => {
      console.error('[sync-user] failed', err);
      return user.id;
    });
    // Access revocation is enforced here, with authorisation, rather than in
    // the UI: every API route funnels through getAuthUser() (directly or via
    // requireRole), so a suspended or soft-deleted account stops being able to
    // do anything at the same moment an admin flips the column. Hiding the nav
    // would leave every endpoint open to a saved URL or a stale tab.
    if (await isAccountBlocked(dbUserId)) return null;

    // Use the DB's user id so FK constraints (sessions.user_id, etc.) work.
    // The auth provider's id may differ from the DB row after a provider rotation.
    return { ...user, id: dbUserId };
  }
  return user;
}

/**
 * Whether this account has had its access revoked.
 *
 * Fails **open** on a database error, deliberately: an outage must not sign
 * every user out of the product. Suspension is an administrative action on a
 * handful of accounts, not a security boundary against a compromised database.
 */
export async function isAccountBlocked(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ? row.status !== 'active' : false;
  } catch (err) {
    console.error('[auth] status check failed', err instanceof Error ? err.message : String(err));
    return false;
  }
}

async function resolveDbId(user: { id: string; email?: string } | null) {
  if (!user?.email) return user;
  try {
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1);
    return dbUser ? { ...user, id: dbUser.id } : user;
  } catch (err) {
    console.error('[resolveDbId] DB query failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Read-only session check safe for Server Components.
 *  Tries the cached session_data JWT first; falls back to calling the
 *  auth handler with the session_token cookie (no cookie rotation). */
export async function getAuthUserReadOnly() {
  const cookieStore = await cookies();

  // Fast path: try the cached session_data JWT (HTTPS only)
  const sessionDataValue = cookieStore.get(SESSION_DATA_COOKIE)?.value;
  if (sessionDataValue) {
    try {
      const config = getConfig();
      const secret = new TextEncoder().encode(config.cookies.secret);
      const { payload } = await jwtVerify(sessionDataValue, secret, { algorithms: ['HS256'] });
      return resolveDbId((payload as Record<string, unknown>)?.user as { id: string; email?: string } | null ?? null);
    } catch (err) {
      // An expired session_data JWT is the normal steady state — the cookie is
      // short-lived and the session_token fallback below re-establishes it.
      // Only surface verification failures that indicate a real problem.
      const code = (err as { code?: string } | undefined)?.code;
      if (code !== 'ERR_JWT_EXPIRED') {
        console.error('[getAuthUserReadOnly] JWT verify failed:', err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Fallback: call auth handler directly with session_token cookie
  const sessionToken = cookieStore.get(SESSION_TOKEN_COOKIE)?.value;
  if (!sessionToken) return null;

  try {
    const allCookies = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
    const baseUrl = process.env.NEON_AUTH_BASE_URL || 'http://localhost:3000';
    const request = new NextRequest(new URL('/api/auth/get-session', baseUrl), {
      headers: { cookie: allCookies },
    });
    const handler = auth.handler();
    const response = await handler.GET!(request, {
      params: Promise.resolve({ path: ['get-session'] }),
    });
    const data = await response.clone().json();
    return resolveDbId((data?.user as { id: string; email?: string } | null) ?? null);
  } catch (err) {
    console.error('[getAuthUserReadOnly] Fallback failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function requireAuthUser() {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

/**
 * The signed-in user's role, or null when nobody is signed in.
 *
 * `users.role` is the authority — a `tutors` row says what someone teaches,
 * not that they are allowed to teach.
 */
export async function getUserRole(): Promise<UserRole | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
  return toUserRole(row?.role);
}

/**
 * The same answer as `getUserRole`, off the read-only session path.
 *
 * For Server Components — layouts and pages that only want to route on the
 * role. `getAuthUser` can rotate the session cookie, which a component render
 * is not allowed to do; `getAuthUserReadOnly` exists precisely for this.
 *
 * Never for authorisation: routes gate with `requireRole`.
 */
export async function getUserRoleReadOnly(): Promise<UserRole | null> {
  const user = await getAuthUserReadOnly();
  if (!user?.id) return null;
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
    return toUserRole(row?.role);
  } catch (err) {
    console.error('[getUserRoleReadOnly] role read failed', err);
    return null;
  }
}

/**
 * Thrown by `requireRole`. Carries the status a route handler should answer
 * with: 401 when nobody is signed in, 404 when someone is but lacks the role.
 *
 * 404 rather than 403 for the same reason `loadBookingForUser` collapses
 * "not found" and "not yours" — a learner probing /admin should not be able
 * to tell an admin console exists from the status code.
 */
export class RoleError extends Error {
  constructor(readonly status: 401 | 404, message: string) {
    super(message);
    this.name = 'RoleError';
  }
}

export interface RoleCheckResult {
  user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>;
  role: UserRole;
}

/**
 * Gate for every tutor and admin surface. `admin` satisfies any role — see
 * `satisfiesRole` in lib/auth/roles.ts.
 *
 * Throws rather than returning null so a handler cannot forget to check the
 * result; `roleErrorResponse` turns the throw into the right HTTP answer.
 */
export async function requireRole(required: UserRole | UserRole[]): Promise<RoleCheckResult> {
  const user = await getAuthUser();
  if (!user) throw new RoleError(401, 'Unauthorized');

  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
  const role = toUserRole(row?.role);
  if (!satisfiesRole(role, required)) throw new RoleError(404, 'Not found');

  return { user, role };
}

/** Maps a `requireRole` throw onto a response; rethrows anything else. */
export function roleErrorResponse(err: unknown): Response {
  if (err instanceof RoleError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  throw err;
}
