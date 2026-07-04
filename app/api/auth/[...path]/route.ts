import { auth } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';

const builtin = auth.handler();

async function forwardToNeon(request: NextRequest, path: string) {
  const baseUrl = process.env.NEON_AUTH_BASE_URL!;
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

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[forwardToNeon] fetch failed', { path, url: upstreamUrl, error: String(err) });
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
      let fixed = cookie.replace(/;\s*Domain\s*=[^;]+/gi, '');
      fixed = fixed.replace(/;\s*Path\s*=[^;]+/gi, '');
      fixed += '; Path=/';
      responseHeaders.append('Set-Cookie', fixed);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
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

  // Replace Neon Auth domain with our proxy URL in the init redirect
  const proxyUrl = `${new URL(request.url).origin}/api/auth`;
  const modifiedUrl = oauthUrl.replace(
    /https?:\/\/[^/]+\/neondb\/auth/g,
    proxyUrl,
  );

  if (modifiedUrl === oauthUrl) return response;

  // Build response with cookies via Headers (handles multi-value Set-Cookie, rewrites Path for our domain)
  const newHeaders = new Headers();
  newHeaders.set('content-type', 'application/json');
  for (const cookie of cloned.headers.getSetCookie()) {
    let fixed = cookie.replace(/;\s*Domain\s*=[^;]+/gi, '');
    fixed = fixed.replace(/;\s*Path\s*=[^;]+/gi, '');
    fixed += '; Path=/';
    newHeaders.append('Set-Cookie', fixed);
  }

  return new Response(JSON.stringify({ ...body, url: modifiedUrl }), {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

async function handleGET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');

  // For init and callback paths, use manual redirect forwarding
  // NOTE: redirect_uri is NOT modified — Google redirects directly to the
  // upstream callback, and Better Auth's verifier exchange creates a local session
  if (path === 'sign-in/social/init' || path.startsWith('callback/')) {
    return await forwardToNeon(request, path);
  }

  return builtin.GET!(request, { params });
}

export const GET = handleGET;
export const POST = handlePOST;
export const { PUT, DELETE, PATCH } = builtin;
