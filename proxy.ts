import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth/server';

const protectedMiddleware = auth.middleware({
  loginUrl: '/auth',
});

const PUBLIC_REFRESH_PATHS = new Set(['/']);

const authApiHandler = auth.handler();

async function checkSessionAndRedirect(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') || '';

  if (!cookieHeader.includes('neon-auth.session_token')) {
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
      const redirectResponse = NextResponse.redirect(new URL('/home', request.url));
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
  const { pathname } = request.nextUrl;

  // Allow unauthenticated access to onboarding
  if (pathname.startsWith('/onboarding')) {
    return NextResponse.next();
  }

  // Public routes — redirect authenticated users to /home
  if (PUBLIC_REFRESH_PATHS.has(pathname)) {
    return checkSessionAndRedirect(request);
  }

  // Everything else requires auth
  return protectedMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|avatar.png|background.png|restaurant.png|.+\.hdr|.+\.mp4|.+\.png|.+\.jpg|.+\.jpeg|.+\.webp|.+\.gif|.+\.svg|.+\.ico|.+\.woff2?|.+\.ttf|.+\.glb|.+\.css|.+\.js|.+\.json|auth|api|share).*)'],
};
