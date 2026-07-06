import { createNeonAuth } from '@neondatabase/auth/next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { syncUser } from './sync-user';

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
    await syncUser({ id: user.id, email: user.email!, name: user.name! }).catch(
      (err) => console.error('[sync-user] failed', err),
    );
  }
  return user;
}

/** Read-only session check safe for Server Components.
 *  Reads the cached session_data cookie (signed JWT, HS256) directly,
 *  so it never falls through to the upstream `/get-session` call that
 *  would attempt `cookieStore.set()` — which Next.js forbids outside
 *  Server Actions and Route Handlers.
 *
 *  Returns the user or null — no cookie rotation, no upstream call.
 *  Used only for non-sensitive gating (landing page redirect). */
export async function getAuthUserReadOnly() {
  const cookieStore = await cookies();
  const sessionDataValue = cookieStore.get('__Secure-neon-auth.local.session_data')?.value;
  if (!sessionDataValue) return null;

  try {
    const config = getConfig();
    const secret = new TextEncoder().encode(config.cookies.secret);
    const { payload } = await jwtVerify(sessionDataValue, secret, { algorithms: ['HS256'] });
    return (payload as Record<string, unknown>)?.user ?? null;
  } catch (err) {
    console.error('[getAuthUserReadOnly] Unexpected error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function requireAuthUser() {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
