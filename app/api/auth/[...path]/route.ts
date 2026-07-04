import { auth } from '@/lib/auth/server';
import type { NextRequest } from 'next/server';

const handler = auth.handler();

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const response = await handler.POST!(request, { params });
  if (!response.ok || response.status !== 200) return response;

  const cloned = response.clone();
  let body: any;
  try {
    body = await cloned.json();
  } catch {
    return response;
  }

  const oauthUrl = body?.url;
  if (!oauthUrl || !oauthUrl.includes('accounts.google.com')) return response;

  const origin = new URL(request.url).origin;
  const modifiedGoogleUrl = new URL(oauthUrl);
  modifiedGoogleUrl.searchParams.set('redirect_uri', `${origin}/api/auth/callback/google`);

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
