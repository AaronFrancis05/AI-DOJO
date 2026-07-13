import { auth, getConfig } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const builtin = auth.handler();

function rewriteSetCookieForLocalDomain(cookie: string): string {
  const needsSecure = /__Secure-/.test(cookie);
  const isChallengeCookie = cookie.includes('session_challange');
  let cleaned = cookie
    .replace(/;\s*Domain\s*=[^;]+/gi, '')
    .replace(/;\s*SameSite\s*=[^;]+/gi, '');
  if (!needsSecure) {
    cleaned = cleaned.replace(/;\s*Secure/gi, '');
  }
  const sameSite = isChallengeCookie ? 'None' : 'Lax';
  return cleaned + `; SameSite=${sameSite}; Path=/`;
}

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
    return NextResponse.redirect(new URL('/auth?error=init_failed', request.url));
  }

  if (upstream.status >= 400) {
    const text = await upstream.text().catch(() => '');
    console.error('[oauth-init] upstream error', { status: upstream.status, bodyPreview: text.slice(0, 100) });
    return NextResponse.redirect(new URL('/auth?error=init_failed', request.url));
  }

  const responseHeaders = new Headers(upstream.headers);

  const setCookies = responseHeaders.getSetCookie();
  if (setCookies.length > 0) {
    responseHeaders.delete('Set-Cookie');
    for (const cookie of setCookies) {
      responseHeaders.append('Set-Cookie', cookie);
      responseHeaders.append('Set-Cookie', rewriteSetCookieForLocalDomain(cookie));
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function proxyToUpstream(request: NextRequest, path: string, options?: { redirect?: 'follow' | 'error' | 'manual' }) {
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
  headers.set('origin', new URL(request.url).origin);
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

  const responseHeaders = new Headers(upstream.headers);

  const setCookies = responseHeaders.getSetCookie();
  if (setCookies.length > 0) {
    responseHeaders.delete('Set-Cookie');
    for (const cookie of setCookies) {
      responseHeaders.append('Set-Cookie', cookie);
      const localCopy = rewriteSetCookieForLocalDomain(cookie);
      responseHeaders.append('Set-Cookie', localCopy);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function proxyGoogleInitRedirect(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  const cookieHeader = request.headers.get('cookie') || '';

  const syntheticRequest = new Request(new URL('/api/auth/sign-in/social', origin), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': origin,
      'cookie': cookieHeader,
      'user-agent': request.headers.get('user-agent') || '',
      'referer': request.headers.get('referer') || '',
    },
    body: JSON.stringify({
      provider: 'google',
      callbackURL: '/api/auth/oauth/callback',
    }),
  });

  const proxyResponse = await proxyToUpstream(syntheticRequest as any, 'sign-in/social', { redirect: 'manual' });

  const location = proxyResponse.headers.get('Location');
  if (location) {
    const response = NextResponse.redirect(location);
    for (const cookie of proxyResponse.headers.getSetCookie()) {
      response.headers.append('Set-Cookie', cookie);
    }
    return response;
  }

  let body: any;
  try {
    body = await proxyResponse.clone().json();
  } catch {
    console.error('[google-init] failed to parse upstream response');
    return NextResponse.redirect(new URL('/auth?error=no_oauth_url', request.url));
  }

  const url = body?.url;
  if (!url) {
    console.error('[google-init] no url in upstream JSON', { body });
    return NextResponse.redirect(new URL('/auth?error=no_oauth_url', request.url));
  }

  const response = NextResponse.redirect(url);
  for (const cookie of proxyResponse.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}

async function handleOAuthExchange(request: NextRequest) {
  const url = new URL(request.url);
  const verifier = url.searchParams.get('neon_auth_session_verifier');
  console.log('[oauth] callback received', { verifier: verifier?.slice(0, 20), path: url.pathname });

  if (!verifier) {
    console.log('[oauth] no verifier found, redirecting to /auth');
    return NextResponse.redirect(new URL('/auth?error=no_verifier', request.url));
  }

  // Route through the SDK's built-in handler that processes get-session.
  // This goes through handleAuthProxyRequest which:
  //   1. Tries trySessionCache() (misses — no session_data yet on OAuth callback)
  //   2. Calls handleAuthRequest() → upstream GET /get-session with verifier
  //   3. Calls handleAuthResponse() → prepareResponseHeaders() + mintSessionDataFromResponse()
  //   4. mintSessionDataFromResponse() calls mintSessionDataCookie() → session_data cookie minted
  //
  // This ensures the session_data cache cookie is created on successful OAuth login,
  // avoiding the fragile 3-second upstream timeout on subsequent session checks.
  const builtinResponse = await builtin.GET!(request, {
    params: Promise.resolve({ path: ['get-session'] }),
  });

  if (!builtinResponse.ok || builtinResponse.status >= 400) {
    const body = await builtinResponse.text().catch(() => '');
    console.error('[oauth] builtin handler error', {
      status: builtinResponse.status,
      bodyPreview: body.slice(0, 100),
    });
    return NextResponse.redirect(new URL('/auth?error=exchange_failed', request.url));
  }

  const responseHeaders = new Headers(builtinResponse.headers);

  console.log('[oauth] session cookies from builtin handler', {
    count: builtinResponse.headers.getSetCookie().length,
    names: builtinResponse.headers.getSetCookie().map((c) => c.split('=')[0]),
  });

  // Set cookies on the response
  const setCookies = builtinResponse.headers.getSetCookie();
  for (const cookie of setCookies) {
    responseHeaders.append('Set-Cookie', cookie);
  }

  responseHeaders.set('Location', '/home');

  return new Response(null, { status: 302, headers: responseHeaders });
}

async function handleGET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');

  if (path === 'oauth/callback') {
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

  if (path === 'sign-in/social') {
    return proxyToUpstream(request, path);
  }

  if (path === 'sign-out') {
    console.log('[sign-out] request received', {
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent')?.slice(0, 80),
      timestamp: Date.now(),
      method: request.method,
      hasCookie: !!request.headers.get('cookie'),
    });
  }

  const response = await builtin.POST!(request, { params });

  if (!response.ok || response.status !== 200) return response;

  const cloned = response.clone();
  let body: any;
  try {
    body = await cloned.json();
  } catch {
    return response;
  }

  const oauthUrl = body?.url;
  if (!oauthUrl) return response;

  const proxyUrl = `${new URL(request.url).origin}/api/auth`;
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
