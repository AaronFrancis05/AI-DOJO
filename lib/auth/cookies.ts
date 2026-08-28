/**
 * Cookie names minted by `@neondatabase/auth`. Every one carries the SDK's
 * `__Secure-neon-auth` prefix (`NEON_AUTH_COOKIE_PREFIX`), because the SDK
 * hardcodes `secure: true` on all of them.
 *
 * They live here, spelled once, because hand-writing them at each call site is
 * what broke: `cookies().get()` matches the name exactly, so the unprefixed
 * `'neon-auth.session_token'` this used to read never matched anything and
 * silently disabled the session fallback in `getAuthUserReadOnly`.
 */
export const SESSION_TOKEN_COOKIE = '__Secure-neon-auth.session_token';
export const SESSION_DATA_COOKIE = '__Secure-neon-auth.local.session_data';

/** Copies SDK cookie headers verbatim, preserving their security attributes. */
export function appendSetCookies(target: Headers, source: Headers): void {
  for (const cookie of source.getSetCookie()) {
    target.append('set-cookie', cookie);
  }
}
