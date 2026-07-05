import { auth, getConfig } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const builtin = auth.handler();

function rewriteSetCookieForLocalDomain(cookie: string): string {
  const needsSecure = /__Secure-/.test(cookie);
  let cleaned = cookie
    .replace(/;\s*Domain\s*=[^;]+/gi, '')
    .replace(/;\s*SameSite\s*=[^;]+/gi, '');
  if (!needsSecure) {
    cleaned = cleaned.replace(/;\s*Secure/gi, '');
  }
  return cleaned + '; SameSite=Lax; Path=/';
}

async function proxyToUpstream(request: NextRequest, path: string) {
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

  const body = request.method === 'POST' ? await request.text().catch(() => undefined) : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      redirect: 'manual',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[proxy] fetch failed', { path, url: upstreamUrl, error: String(err) });
    return new Response(
      JSON.stringify({ error: 'Failed to reach auth server' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
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
  const { baseUrl } = getConfig();

  const headers = new Headers();
  const forwardHeaders = ['user-agent', 'authorization', 'referer', 'content-type'];
  for (const h of forwardHeaders) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('origin', new URL(request.url).origin);
  headers.set('content-type', 'application/json');

  const body = JSON.stringify({
    provider: 'google',
    callbackURL: '/api/auth/oauth/callback',
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/sign-in/social`, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[google-init] fetch failed', { error: String(err) });
    return NextResponse.redirect(new URL('/auth?error=init_failed', request.url));
  }

  const location = upstream.headers.get('Location');
  if (!location) {
    console.error('[google-init] no Location header from upstream');
    return NextResponse.redirect(new URL('/auth?error=no_oauth_url', request.url));
  }

  const response = NextResponse.redirect(location);
  const setCookies = upstream.headers.getSetCookie();
  for (const cookie of setCookies) {
    response.headers.append('Set-Cookie', cookie);
    const localCopy = rewriteSetCookieForLocalDomain(cookie);
    response.headers.append('Set-Cookie', localCopy);
  }

  return response;
}

async function handleOAuthExchange(request: NextRequest) {
  const { baseUrl } = getConfig();
  const url = new URL(request.url);

  const verifier = url.searchParams.get('neon_auth_session_verifier');
  console.log('[oauth] callback received', { verifier: verifier?.slice(0, 20), path: url.pathname });

  if (!verifier) {
    console.log('[oauth] no verifier found, redirecting to /auth');
    return NextResponse.redirect(new URL('/auth?error=no_verifier', request.url));
  }

  const upstreamUrl = `${baseUrl}/get-session${url.search}`;

  const headers = new Headers();
  for (const h of ['user-agent', 'content-type', 'origin']) {
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
  console.log('[oauth] forwarding cookies to upstream', { neonCookies: neonCookies.length > 0 });
  headers.set('origin', new URL(request.url).origin);

  let upstream: Response;
  try {
    console.log('[oauth] fetching upstream', { url: upstreamUrl });
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    console.log('[oauth] upstream response', { status: upstream.status, ok: upstream.ok });
  } catch (err) {
    console.error('[oauth-exchange] fetch failed', { url: upstreamUrl, error: String(err) });
    return NextResponse.redirect(new URL('/auth?error=exchange_failed', request.url));
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    console.error('[oauth-exchange] upstream error', { status: upstream.status, statusText: upstream.statusText, body: text });
    return NextResponse.redirect(new URL('/auth?error=exchange_failed', request.url));
  }

  const responseHeaders = new Headers();
  const setCookies = upstream.headers.getSetCookie();
  console.log('[oauth] session cookies from upstream', { count: setCookies.length });
  for (const cookie of setCookies) {
    const fixed = rewriteSetCookieForLocalDomain(cookie);
    responseHeaders.append('Set-Cookie', fixed);
  }
  responseHeaders.set('Location', '/');

  return new Response(null, { status: 302, headers: responseHeaders });
}

async function handleGET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');

  if (path === 'oauth/callback') {
    return handleOAuthExchange(request);
  }

  if (path === 'sign-in/social/init') {
    return proxyToUpstream(request, path);
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
