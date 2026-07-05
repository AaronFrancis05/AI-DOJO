# AI DOJO — Memory & Status

---

## Goal
Interactive Japanese role-play training app for Ugandan learners using Neon Auth, Google Gemini, Next.js 16

## Constraints & Preferences
- Neon Auth SDK (`@neondatabase/auth` v0.4.2-beta) — Better Auth hosted, unstable
- Cookie SameSite must support cross-site OAuth redirect; `lax` configured globally
- OAuth callback goes through custom `handleOAuthExchange` (not SDK middleware)
- Deployed on Vercel at `ai-dojo-opal.vercel.app`; preview deployments get separate `ai-dojo-<hash>...vercel.app` URLs

## Progress

### Done
- Google OAuth full flow works on desktop: click → Google → callback → session → home
- Email/password sign-up, sign-in, reset, email OTP verification
- Chat/role-play with Google Gemini (`gemini-2.5-flash`) with 10-turn cap
- Session management (list, share, delete) with share token public view
- Profile page (name update, password change, sign-out)
- Dashboard scenario card grid with difficulty badges, context, learning goals
- NavBar with active route highlighting and logout
- Middleware protects all page routes; `/api/*` excluded (handles auth internally)
- Cookie rewriting: strips `Domain`, strips `SameSite`, conditionally strips `Secure` (preserved for `__Secure-` prefix), adds `SameSite=Lax; Path=/`
- `x-neon-auth-middleware: true` header added to all upstream fetches
- `handleOAuthExchange` no longer uses `redirect: 'manual'` (matches SDK behavior)
- Clipboard `NotAllowedError` silenced with `.catch(() => {})`
- Branch `test/plain-sdk-handler` deleted locally and on remote

### In Progress
- **Mobile OAuth session drops after ~20 seconds** — Google OAuth callback succeeds, session is valid, then middleware starts returning 307 redirects, automatic `POST /api/auth/sign-out` fires, user bounces to `/auth`

### Blocked
- (none)

## Key Decisions
- **Custom `handleOAuthExchange` instead of SDK middleware**: allows server-side verifier exchange with upstream `/get-session` and full control over cookie rewriting; avoids middleware intercept for `/api/auth/*`
- **`SameSite=Lax` hardcoded in `rewriteSetCookieForLocalDomain`**: chosen for top-level navigation compatibility; may need `None; Secure` if cross-site redirects cause cookie drops
- **Synchronous redirect for OAuth init** (`window.location.href = '/api/auth/google/init'`): avoids async fetch losing user gesture on mobile (replaced `authClient.signIn.social()`)
- **All `/api/*` excluded from middleware**: prevents API fetch responses being HTML login pages; API routes handle auth internally via `getAuthUser()`

## Next Steps
1. Fix root cause: OAuth session drops after ~20 seconds on mobile
2. Investigate the 6 points from the deep investigation:
   - **ProxyToUpstream 307 handling**: `redirect: 'manual'` still in `proxyToUpstream` — `sign-in/social` init returns 307, which is treated as error because upstream.ok is false for redirect responses
   - **PKCE verifier cookie**: set by upstream via `proxyToUpstream` which does NOT forward it back to the client because set-cookie is rewritten but `Path=/` is appended — same as session cookies, domain-scoped correctly
   - **handleOAuthExchange cookie rewriting**: `SameSite=Lax` hardcoded, `Secure` preserved for all cookies (no conditional stripping) — PKCE verifier cookies not deleted after exchange. Also no `Max-Age`/`Expires` short expiry on verifier cookies
   - **Vercel two-domain mismatch**: logs show both production alias and preview URL; if user hits preview domain during OAuth, cookies set there won't be sent to production alias. Fix: single canonical domain
   - **SignOut detection on mobile**: the auth client fires signOut when `getSession()` returns no session. The proxy's `redirect: 'manual'` means a 3xx from `/get-session` is treated as a failed response (since `upstream.ok` is `false` for redirects). The 307 response from upstream (session expired or missing) doesn't render as an error page — it redirects to /auth, then the client POSTs to sign-out
   - **Middleware exclusion for /api/***: already correct — `/api/auth/sign-out` is excluded from middleware. But the sign-out POST still reaches the builtin handler which clears the session

## Critical Context
- **Two domains in Vercel logs**: production alias `ai-dojo-opal.vercel.app` and preview URL `ai-dojo-<hash>-taremwa-aaron-francis-projects.vercel.app` — session set on one domain won't be sent to the other
- `session_data` cookie (signed JWT, 300s default TTL) is minted by SDK middleware; `session_token` cookie (from upstream) has upstream's Max-Age preserved
- `handleOAuthExchange` calls upstream `/get-session?neon_auth_session_verifier=...` — if upstream responds with 3xx (not 200), `!upstream.ok` path fires (even without `redirect: 'manual'` if the final response after following redirects is non-2xx)
- `proxyToUpstream` still has `redirect: 'manual'` — this means `sign-in/social/init` returning 307 is treated as non-ok
- `rewriteSetCookieForLocalDomain` preserves `Max-Age` and `Expires` from upstream — short upstream session TTL would cause early expiry
- `proxyGoogleInitRedirect` constructs synthetic POST to `proxyToUpstream` with hardcoded `callbackURL: '/api/auth/oauth/callback'` — upstream resolves this to absolute URL using `Origin` header (set to incoming request origin)
- Cookie `Domain` attribute is always stripped; no domain is set — cookie scoped to request origin
- The `session_data` cookie is minted by SDK middleware inside `processAuthMiddleware` during `exchangeOAuthToken` — this only runs if the SDK handler is invoked for the callback; our custom `handleOAuthExchange` bypasses it entirely, so no `session_data` cookie is ever set on the client (only `session_token` from upstream)
- `authClient.signOut()` is triggered from the `onError` callback in `hostedGetSession` in the SDK — if `getSession` fails (no session returned), the client auto-signs-out

## Relevant Files
- `app/api/auth/[...path]/route.ts`: Custom OAuth handlers (`handleOAuthExchange`, `proxyGoogleInitRedirect`, `proxyToUpstream`) and `rewriteSetCookieForLocalDomain`
- `proxy.ts`: Middleware matcher (`'/', '/((?!_next/static|_next/image|favicon.ico|auth|api).*)'`), `auth.middleware({ loginUrl: '/auth' })`
- `lib/auth/server.ts`: `getConfig()` — `sameSite: 'lax'`, no `domain` or `sessionDataTtl` set
- `lib/auth/client.ts`: `createAuthClient()` — plain SDK client
- `app/auth/page.tsx`: `handleGoogleAuth()` — synchronous `window.location.href = '/api/auth/google/init'`
- `node_modules/@neondatabase/auth/dist/next/server/index.mjs`: SDK internals — `mintSessionDataCookie` (300s default TTL, `sameSite` from config, `secure: true`), `exchangeOAuthToken` (checks verifier + challenge cookie locally before upstream call), `processAuthMiddleware`, `hostedGetSession`, `signOut`
- `app/sessions/page.tsx`, `app/chat/[id]/page.tsx`: Share API calls with silenced clipboard error
