import { createNeonAuth } from '@neondatabase/auth/next/server';
import type { NextRequest } from 'next/server';

function getConfig() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl) throw new Error('NEON_AUTH_BASE_URL is not set');
  if (!cookieSecret) throw new Error('NEON_AUTH_COOKIE_SECRET is not set');

  return { baseUrl, cookies: { secret: cookieSecret } };
}

export const auth = createNeonAuth(getConfig());

export async function getAuthUser() {
  const { data: session } = await auth.getSession();
  return session?.user ?? null;
}

export async function requireAuthUser() {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
