import {
  appUrl,
  getAppOrigin,
  normalizeAuthRedirectUrl,
  withVerifiedRequestOrigin,
} from '@/lib/auth/app-origin';
import { appendSetCookies } from '@/lib/auth/cookies';
import { auth, getConfig } from '@/lib/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';

const builtin = auth.handler();

async function proxyOAuthInitRedirect(request: NextRequest, path: string) {
  const { baseUrl } = getConfig();
  const upstreamUrl = `${baseUrl}/${path}${new URL(request.url).search}`;

  const headers = new Headers();
  for (const h of ['user-agent', 'referer']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  const cookies = request.headers.get('cookie') || '';
  const neonCookies = cookies
    .split(';')
    .map(c => c.trim())
    .filter(c => c.startsWith('__Secure-neon-auth'))
    .join('; ');
  if (neonCookies) headers.set('cookie', neonCookies);
  headers.set('origin', getAppOrigin());
  headers.set('x-neon-auth-middleware', 'true');

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[oauth-init] fetch failed', { url: upstreamUrl, error: String(err) });
    return NextResponse.redirect(appUrl('/auth?error=init_failed'));
  }

  if (upstream.status >= 400) {
    const text = await upstream.text().catch(() => '');
    console.error('[oauth-init] upstream error', { status: upstream.status, bodyPreview: text.slice(0, 100) });
    return NextResponse.redirect(appUrl('/auth?error=init_failed'));
  }

  const responseHeaders = new Headers(upstream.headers);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function proxyToUpstream(request: Request, path: string, options?: { redirect?: 'follow' | 'error' | 'manual' }) {
  const { baseUrl } = getConfig();
  const upstreamUrl = `${baseUrl}/${path}${new URL(request.url).search}`;

  const headers = new Headers();
  const forwardHeaders = ['user-agent', 'authorization', 'referer', 'content-type'];
  for (const h of forwardHeaders) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  const cookies = request.headers.get('cookie') || '';
  const neonCookies = cookies
    .split(';')
    .map(c => c.trim())
    .filter(c => c.startsWith('__Secure-neon-auth'))
    .join('; ');
  if (neonCookies) headers.set('cookie', neonCookies);
  headers.set('origin', request.headers.get('origin') || getAppOrigin());
  headers.set('x-neon-auth-middleware', 'true');

  const body = request.method === 'POST' ? await request.text().catch(() => undefined) : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: options?.redirect,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[proxy] fetch failed', { path, url: upstreamUrl, error: String(err) });
    return new Response(
      JSON.stringify({ error: 'Failed to reach auth server' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  if (upstream.status >= 400 && upstream.status < 600) {
    const text = await upstream.text().catch(() => '');
    console.error('[proxy] upstream error', { status: upstream.status, path, bodyPreview: text.slice(0, 100) });
    return new Response(
      JSON.stringify({ error: 'Auth server error' }),
      { status: upstream.status, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

async function proxyGoogleInitRedirect(request: NextRequest) {
  const origin = getAppOrigin();
  const cookieHeader = request.headers.get('cookie') || '';

  const syntheticRequest = new Request(new URL('/api/auth/sign-in/social', origin), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      cookie: cookieHeader,
      'user-agent': request.headers.get('user-agent') || '',
      referer: request.headers.get('referer') || '',
    },
    body: JSON.stringify({
      provider: 'google',
      // Relative callback; Neon resolves against the Origin we send (public site URL).
      callbackURL: '/api/auth/oauth/callback',
    }),
  });

  const proxyResponse = await proxyToUpstream(syntheticRequest, 'sign-in/social', { redirect: 'manual' });

  const location = proxyResponse.headers.get('Location');
  if (location) {
    const response = NextResponse.redirect(normalizeAuthRedirectUrl(location));
    appendSetCookies(response.headers, proxyResponse.headers);
    return response;
  }

  let body: { url?: unknown };
  try {
    body = await proxyResponse.clone().json() as { url?: unknown };
  } catch {
    console.error('[google-init] failed to parse upstream response');
    return NextResponse.redirect(appUrl('/auth?error=no_oauth_url'));
  }

  const url = typeof body.url === 'string' ? body.url : null;
  if (!url) {
    console.error('[google-init] no url in upstream JSON', { body });
    return NextResponse.redirect(appUrl('/auth?error=no_oauth_url'));
  }

  const response = NextResponse.redirect(normalizeAuthRedirectUrl(url));
  appendSetCookies(response.headers, proxyResponse.headers);
  return response;
}

async function handleOAuthExchange(request: NextRequest) {
  const url = new URL(request.url);
  const verifier = url.searchParams.get('neon_auth_session_verifier');

  if (!verifier) {
    return NextResponse.redirect(appUrl('/auth?error=no_verifier'));
  }

  // The SDK derives the OAuth exchange URL from request.url. This is the only
  // request URL rewritten to the browser-reachable origin.
  const headers = new Headers(request.headers);
  headers.set('origin', getAppOrigin());
  const publicRequest = new NextRequest(
    new URL(url.pathname + url.search, getAppOrigin()),
    { method: 'GET', headers },
  );
  const builtinResponse = await builtin.GET!(publicRequest, {
    params: Promise.resolve({ path: ['get-session'] }),
  });

  if (!builtinResponse.ok || builtinResponse.status >= 400) {
    const body = await builtinResponse.text().catch(() => '');
    console.error('[oauth] builtin handler error', {
      status: builtinResponse.status,
      bodyPreview: body.slice(0, 100),
    });
    return NextResponse.redirect(appUrl('/auth?error=exchange_failed'));
  }

// Onboarding is only for brand-new signups. If this account already exists,
  // the user is returning (just signing in) and should go straight to the app.
  let redirectTarget = '/onboarding';
  try {
    const sessionData = await builtinResponse.clone().json();
    const email = sessionData?.user?.email as string | undefined;
    if (email) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existing) redirectTarget = '/home';
    }
  } catch (err) {
    console.error('[oauth] failed to resolve existing user', err instanceof Error ? err.message : String(err));
  }

  const response = NextResponse.redirect(appUrl(redirectTarget));
  appendSetCookies(response.headers, builtinResponse.headers);
  return response;
}

async function handleGET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');

  // OAuth callback — the verifier exchange. Google/Neon may redirect to either
  // `/api/auth/oauth/callback` or the SDK-default `/api/auth/callback/<provider>`.
  if (path === 'oauth/callback' || path === 'callback' || path.startsWith('callback/')) {
    return handleOAuthExchange(request);
  }

  if (path === 'sign-in/social/init') {
    return proxyOAuthInitRedirect(request, path);
  }

  if (path === 'google/init') {
    return proxyGoogleInitRedirect(request);
  }

  return builtin.GET!(request, { params });
}

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  let verifiedRequest: Request;
  try {
    // withVerifiedRequestOrigin now mutates the existing request in place
    // instead of `new Request(request, ...)` which throws for NextRequest
    // ("Cannot read private member #state"). No re-wrapping needed.
    verifiedRequest = withVerifiedRequestOrigin(request);
  } catch (err) {
    console.error('[auth-proxy] Origin check failed', {
      path,
      origin: request.headers.get('origin'),
      // Never call getAppOrigin() here — it throws when APP_ORIGIN is unset
      // in production, which would mask the original error before the 403.
      appOrigin: process.env.APP_ORIGIN ?? '(unset)',
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Invalid Origin' }, { status: 403 });
  }

  if (path === 'sign-in/social') {
    return proxyToUpstream(verifiedRequest, path);
  }

  const response = await builtin.POST!(verifiedRequest, { params });

  if (path === 'sign-out' && (!response.ok || response.status >= 400)) {
    const bodyPreview = await response.clone().text().catch(() => '');
    console.error('[auth-proxy] sign-out upstream error', {
      status: response.status,
      bodyPreview: bodyPreview.slice(0, 300),
    });
  }

  if (!response.ok || response.status !== 200) return response;

  const cloned = response.clone();
  let body: { url?: unknown };
  try {
    body = await cloned.json() as { url?: unknown };
  } catch {
    return response;
  }

  const oauthUrl = typeof body.url === 'string' ? body.url : null;
  if (!oauthUrl) return response;

  const proxyUrl = `${getAppOrigin()}/api/auth`;
  const modifiedUrl = oauthUrl.replace(
    /https?:\/\/[^/]+\/neondb\/auth/g,
    proxyUrl,
  );

  if (modifiedUrl === oauthUrl) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify({ ...body, url: modifiedUrl }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const GET = handleGET;
export const POST = handlePOST;
export const { PUT, DELETE, PATCH } = builtin;
