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

  const upstream = await fetch(upstreamUrl, {
    method: 'GET',
    redirect: 'manual',
    headers,
  });

  const responseHeaders = new Headers(upstream.headers);

  // Remove Domain from Set-Cookie to make cookies host-only for our domain
  const setCookies = responseHeaders.getSetCookie();
  if (setCookies.length > 0) {
    responseHeaders.delete('Set-Cookie');
    for (const cookie of setCookies) {
      responseHeaders.append(
        'Set-Cookie',
        cookie.replace(/;\s*Domain\s*=[^;]+/gi, ''),
      );
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

  return Response.json(
    { ...body, url: modifiedUrl },
    {
      status: response.status,
      statusText: response.statusText,
      headers: cloned.headers,
    },
  );
}

async function handleGET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');

  // For init and callback paths, use manual redirect forwarding
  if (path === 'sign-in/social/init' || path.startsWith('callback/')) {
    const response = await forwardToNeon(request, path);

    // For init responses with Google OAuth redirect, rewrite redirect_uri
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (location && location.includes('accounts.google.com')) {
        const googleUrl = new URL(location);
        googleUrl.searchParams.set(
          'redirect_uri',
          `${new URL(request.url).origin}/api/auth/callback/google`,
        );
        const headers = new Headers(response.headers);
        headers.set('Location', googleUrl.toString());
        return new Response(null, {
          status: response.status,
          headers,
        });
      }
    }

    return response;
  }

  return builtin.GET!(request, { params });
}

export const GET = handleGET;
export const POST = handlePOST;
export const { PUT, DELETE, PATCH } = builtin;
