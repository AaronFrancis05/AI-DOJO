/**
 * Where each role's door is, and where it lets out.
 *
 * Split out of the auth pages because three of them now need the same two
 * answers — sign-in, sign-up and the OAuth callback all have to agree on where
 * a tutor lands, or the "am I a learner or a tutor?" flip-flop comes straight
 * back. Client-safe: no Drizzle, no `lib/auth/server`.
 */

import type { UserRole } from './roles';

/**
 * The landing page for a role.
 *
 * `users.role` is the authority, not the door someone came through. A tutor
 * who signs in on the learner form is still a tutor and still lands on the
 * console — routing off the *form* is what made the app disagree with itself
 * about who was signing in.
 */
export function roleHome(role: UserRole | null): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'tutor':
      return '/tutor';
    default:
      return '/home';
  }
}

/** The sign-in page for a role. Admin is unlinked — URL only. */
export function roleSignInPath(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/auth/admin/signin';
    case 'tutor':
      return '/auth/tutor/signin';
    default:
      return '/auth/signin';
  }
}

/** The sign-up page for a role. Admin is unlinked — URL only. */
export function roleSignUpPath(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/auth/admin/signup';
    case 'tutor':
      return '/auth/tutor/signup';
    default:
      return '/auth/signup';
  }
}

/**
 * Where to send someone once they are signed in.
 *
 * Only same-origin paths: `next` arrives in the query string — `/auth/tutor`
 * sends returning tutors here as `?next=/tutor` — so anything else is an open
 * redirect. `//host` is protocol-relative and leaves the site, which is why a
 * bare `/` prefix is not enough on its own.
 *
 * Neither is rejecting `//`. The URL parser treats a backslash as a forward
 * slash in an http(s) URL and strips tab/newline/carriage-return outright
 * before parsing, so `/\host`, `/\/host` and `/<TAB>/host` all clear a
 * `startsWith('//')` test and then resolve to `https://host` — the same open
 * redirect through a different spelling. Any of those characters means the
 * string was written to be re-read as something other than what it looks
 * like, so the whole value is refused rather than normalized.
 *
 * The destination still guards itself: `/tutor` and `/admin` redirect anyone
 * without the role to `/home`, so a forged `next` grants nothing.
 */
const NEXT_SMUGGLING = /[\\\t\n\r]/;

export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  if (NEXT_SMUGGLING.test(next)) return null;
  return next;
}

/** Whether a landing was asked for on behalf of an admin. */
export function isAdminDestination(next: string | null | undefined): boolean {
  return next === roleHome('admin');
}

/**
 * What came back from an attempt to claim admin.
 *
 * `denied` is the allowlist's answer and is final: this address is not an
 * admin and re-asking will not change that. `unavailable` is everything else
 * — no session yet, the account row not readable, a 5xx, an offline browser —
 * and says nothing about the address. Collapsing the two is what let a
 * transient failure tell a genuine admin their account "was created as a
 * learner" and route them into the learner app for good.
 */
export type AdminClaimResult =
  | { status: 'claimed' }
  | { status: 'denied'; message: string }
  | { status: 'unavailable'; message: string };

/**
 * Promotes an allowlisted address to admin, best effort.
 *
 * Lives here rather than on the sign-in form because three moments now owe
 * the same call and none of them can be the only one: the admin sign-up has
 * no session yet (the project will not issue one before the address is
 * verified), the verification page may be where the first session appears,
 * and a returning admin arrives already signed in. A copy that any of them
 * skipped is an allowlisted operator left sitting in the learner wizard.
 *
 * `/api/auth/admin/claim` is the gate and is idempotent, so calling it more
 * than once costs nothing — which is what makes a retry the right answer to
 * `unavailable`.
 */
export async function claimAdmin(): Promise<AdminClaimResult> {
  let res: Response;
  try {
    res = await fetch('/api/auth/admin/claim', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    return {
      status: 'unavailable',
      message: 'Could not reach the server to confirm admin access.',
    };
  }

  if (res.ok) return { status: 'claimed' };

  const data = (await res.json().catch(() => null)) as { error?: string } | null;

  // 403 is the allowlist speaking — the one status that is about the address
  // rather than about the request's timing or the server's health.
  if (res.status === 403) {
    return {
      status: 'denied',
      message: data?.error ?? 'This address is not authorised for admin access.',
    };
  }

  return {
    status: 'unavailable',
    message: data?.error ?? 'Could not confirm admin access. Please try again.',
  };
}

/**
 * The signed-in account's role, read from the server.
 *
 * The client cannot be trusted with a role and is not being trusted with one
 * here — this only decides which page to *navigate to*. `/tutor` and `/admin`
 * each re-check server-side before they render, and every API route gates on
 * `requireRole`.
 */
export async function fetchUserRole(): Promise<UserRole | null> {
  try {
    const res = await fetch('/api/user/role', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { role?: unknown };
    return typeof data.role === 'string' ? (data.role as UserRole) : null;
  } catch {
    return null;
  }
}
