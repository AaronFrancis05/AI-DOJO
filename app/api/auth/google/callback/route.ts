import { db } from '../../../../../src/db';
import { users } from '../../../../../src/schema';
import { setAuthCookie } from '../../../../../lib/auth';
import { eq } from 'drizzle-orm';

function getCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return new Response(null, { status: 302, headers: { Location: '/auth?error=oauth_denied' } });
    }

    if (!code || !state) {
      return new Response(null, { status: 302, headers: { Location: '/auth?error=invalid_request' } });
    }

    const cookieHeader = req.headers.get('cookie') ?? '';
    const savedState = getCookieValue(cookieHeader, 'google_oauth_state');

    if (!savedState || savedState !== state) {
      return new Response(null, { status: 302, headers: { Location: '/auth?error=state_mismatch' } });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return Response.json({ error: 'Google OAuth is not configured' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) {
      return new Response(null, { status: 302, headers: { Location: '/auth?error=token_exchange_failed' } });
    }

    const payloadBase64 = tokenData.id_token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));

    const googleId: string = payload.sub;
    const email: string = payload.email;
    const name: string = payload.name || email.split('@')[0];

    if (!email) {
      return new Response(null, { status: 302, headers: { Location: '/auth?error=no_email' } });
    }

    const [existingByGoogle] = await db.select().from(users).where(eq(users.googleId, googleId));
    if (existingByGoogle) {
      const cookie = setAuthCookie(existingByGoogle.id, existingByGoogle.email);
      return new Response(null, {
        status: 302,
        headers: { Location: '/', 'Set-Cookie': cookie },
      });
    }

    const [existingByEmail] = await db.select().from(users).where(eq(users.email, email));
    if (existingByEmail) {
      await db.update(users)
        .set({ googleId, authProvider: 'credentials' })
        .where(eq(users.id, existingByEmail.id));

      const cookie = setAuthCookie(existingByEmail.id, existingByEmail.email);
      return new Response(null, {
        status: 302,
        headers: { Location: '/', 'Set-Cookie': cookie },
      });
    }

    const [newUser] = await db.insert(users).values({
      name,
      email,
      googleId,
      authProvider: 'google',
      consentToDataSharing: false,
    }).returning();

    const cookie = setAuthCookie(newUser.id, newUser.email);
    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Set-Cookie': cookie },
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return new Response(null, { status: 302, headers: { Location: '/auth?error=server_error' } });
  }
}
