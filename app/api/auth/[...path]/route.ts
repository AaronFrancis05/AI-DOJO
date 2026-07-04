import { auth } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';

const handler = auth.handler();

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const response = await handler.POST!(request, { params });

  console.log('[auth-route] POST', {
    path: (await params).path.join('/'),
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok || response.status !== 200) return response;

  const cloned = response.clone();
  let body: any;
  try {
    body = await cloned.json();
  } catch {
    console.log('[auth-route] body not JSON, skipping');
    return response;
  }

  console.log('[auth-route] body keys:', Object.keys(body));
  console.log('[auth-route] url field:', body?.url?.slice(0, 100));

  const oauthUrl = body?.url;
  if (!oauthUrl || !oauthUrl.includes('accounts.google.com')) return response;

  const origin = new URL(request.url).origin;
  const modifiedGoogleUrl = new URL(oauthUrl);
  modifiedGoogleUrl.searchParams.set('redirect_uri', `${origin}/api/auth/callback/google`);

  console.log('[auth-route] modified redirect_uri to:', `${origin}/api/auth/callback/google`);

  return Response.json(
    { ...body, url: modifiedGoogleUrl.toString() },
    {
      status: response.status,
      statusText: response.statusText,
      headers: cloned.headers,
    },
  );
}

export const GET = handler.GET;
export const POST = handlePOST;
export const { PUT, DELETE, PATCH } = handler;
