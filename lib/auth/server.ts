import { createNeonAuth } from '@neondatabase/auth/next/server';
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

export async function requireAuthUser() {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
