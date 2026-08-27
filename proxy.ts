import { appUrl, getAppOrigin } from '@/lib/auth/app-origin';
import { SESSION_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { auth } from '@/lib/auth/server';
import { NextRequest, NextResponse } from 'next/server';

const protectedMiddleware = auth.middleware({
  loginUrl: '/auth',
});

const PUBLIC_REFRESH_PATHS = new Set(['/']);

const authApiHandler = auth.handler();

/** Rebuild the request URL on the public origin so Neon Auth middleware redirects stay routable. */
function withPublicOrigin(request: NextRequest): NextRequest {
  const publicOrigin = getAppOrigin();
  const current = new URL(request.url);
  if (current.origin === publicOrigin) return request;
  // Avoid `new NextRequest(url, request)` — passing a NextRequest as init
  // throws "Cannot read private member #state" in this Next.js version.
  // Rebuild explicitly from URL string + method/headers/body.
  const headers = new Headers(request.headers);
  const init: RequestInit & { duplex?: string } = {
    method: request.method,
    headers,
  };
  // Preserve body for non-GET/HEAD so a POST that reaches protectedMiddleware
  // doesn't arrive with body === null (and a stale content-length).
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    // Clone the stream so the original request remains readable.
    init.body = request.clone().body as unknown as BodyInit;
    init.duplex = 'half';
    // Let fetch set content-length from the stream; a stale header would mismatch.
    headers.delete('content-length');
  }
  return new NextRequest(new URL(current.pathname + current.search, publicOrigin).toString(), init as unknown as never);
}

async function checkSessionAndRedirect(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') || '';

  if (!cookieHeader.includes(SESSION_TOKEN_COOKIE)) {
    return NextResponse.next();
  }

  try {
    const sessionResponse = await authApiHandler.GET!(request, {
      params: Promise.resolve({ path: ['get-session'] }),
    });

    const cookies = sessionResponse.headers.getSetCookie();

    let data: { user?: unknown } | null = null;
    try {
      data = await sessionResponse.clone().json();
    } catch { /* response body not JSON — treat as no session */ }

    if (data?.user) {
      const redirectResponse = NextResponse.redirect(appUrl('/home'));
      for (const cookie of cookies) {
        redirectResponse.headers.append('Set-Cookie', cookie);
      }
      return redirectResponse;
    }

    const response = NextResponse.next();
    for (const cookie of cookies) {
      response.headers.append('Set-Cookie', cookie);
    }
    return response;
  } catch (err) {
    console.error('[proxy] Failed to check session:', err);
    return NextResponse.next();
  }
}

export default async function middleware(request: NextRequest) {
  const req = withPublicOrigin(request);
  const { pathname, searchParams } = req.nextUrl;

  // OAuth return sometimes lands on / with neon_auth_session_verifier — hand off to the exchange route.
  if (searchParams.has('neon_auth_session_verifier')) {
    return NextResponse.redirect(
      appUrl(`/api/auth/oauth/callback?${searchParams.toString()}`),
    );
  }

  // Allow unauthenticated access to onboarding
  if (pathname.startsWith('/onboarding')) {
    return NextResponse.next();
  }

  // Allow unauthenticated access to tryout guest preview (no DB session)
  if (pathname.startsWith('/tryout')) {
    return NextResponse.next();
  }

  // Public routes — redirect authenticated users to /home
  if (PUBLIC_REFRESH_PATHS.has(pathname)) {
    return checkSessionAndRedirect(req);
  }

  // Everything else requires auth
  return protectedMiddleware(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|avatar.png|background.png|restaurant.png|.+\\.hdr$|.+\\.mp4$|.+\\.png$|.+\\.jpg$|.+\\.jpeg$|.+\\.webp$|.+\\.gif$|.+\\.svg$|.+\\.ico$|.+\\.woff2?$|.+\\.ttf$|.+\\.glb$|.+\\.css$|.+\\.js$|.+\\.json$|auth(?:/|$)|api(?:/|$)|share(?:/|$)|tryout(?:/|$)).*)'],
};
