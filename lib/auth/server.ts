import { createNeonAuth } from '@neondatabase/auth/next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { syncUser } from './sync-user';
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
    // Use the DB's user id so FK constraints (sessions.user_id, etc.) work.
    // The auth provider's id may differ from the DB row after a provider rotation.
    return { ...user, id: dbUserId };
  }
  return user;
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
  const sessionDataValue = cookieStore.get('__Secure-neon-auth.local.session_data')?.value;
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
  const sessionToken = cookieStore.get('neon-auth.session_token')?.value;
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
