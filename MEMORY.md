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
2. Investigate remaining hypotheses:
   - **PKCE verifier cookie lifecycle**: verifier cookies are set by upstream during init and not deleted after exchange — no `Max-Age`/`Expires` short expiry set. If a stale verifier cookie persists, it could interfere with subsequent init attempts. Consider clearing it after successful exchange or adding a short `Max-Age`
   - **Vercel two-domain mismatch**: logs show both production alias and preview URL; if user hits preview domain during OAuth, cookies set there won't be sent to production alias. Fix: force single canonical domain
   - **`session_data` cookie never set**: our custom `handleOAuthExchange` bypasses the SDK's middleware that mints the `session_data` signed JWT cache cookie. The upstream's `session_token` is set, but the 300s TTL cache cookie is missing. Without it, every page navigation triggers a full upstream `getSession` call instead of using the cached JWT
   - **Sign-out detection on mobile**: the SDK client fires `signOut()` when `hostedGetSession` returns no session. Now that `handleOAuthExchange` checks `upstream.redirected` and `setCookies.length`, a redirected or cookieless response correctly fails instead of returning success. But if a subsequent `getSession` call (via middleware or client SDK) returns a 3xx/empty, the client still auto-signs-out. Adding retry logic in the SDK's error callback could mitigate transient failures

## Critical Context
- **Two domains in Vercel logs**: production alias `ai-dojo-opal.vercel.app` and preview URL `ai-dojo-<hash>-taremwa-aaron-francis-projects.vercel.app` — session set on one domain won't be sent to the other
- `session_data` cookie (signed JWT, 300s default TTL) is minted by SDK middleware during `exchangeOAuthToken`/`processAuthMiddleware`; `session_token` cookie (from upstream) has upstream's Max-Age preserved
- `proxyOAuthInitRedirect` (for `GET sign-in/social/init`) uses `redirect: 'manual'` to capture Set-Cookie headers from the upstream's 307 redirect; `proxyToUpstream` (for `POST sign-in/social`) uses default `'follow'`
- `handleOAuthExchange` checks `upstream.status >= 400 || upstream.redirected || setCookies.length === 0` — a redirected or cookieless upstream response correctly fails the exchange
- `rewriteSetCookieForLocalDomain` preserves `Max-Age` and `Expires` from upstream — short upstream session TTL would cause early expiry; also preserves `Secure` for `__Secure-`-prefixed cookies, strips it otherwise
- `proxyGoogleInitRedirect` constructs synthetic POST to `proxyToUpstream` with hardcoded `callbackURL: '/api/auth/oauth/callback'` and `redirect: 'manual'` — upstream resolves this to absolute URL using `Origin` header (set to incoming request origin)
- Cookie `Domain` attribute is always stripped by `rewriteSetCookieForLocalDomain`; no domain is set — cookie scoped to request origin
- `SameSite=Lax` is hardcoded in all rewritten cookies — sufficient for same-site top-level navigation; may need `None; Secure` if cross-site redirects cause cookie drops
- The `session_data` cookie is NOT set by our custom `handleOAuthExchange` — the SDK middleware that mints it (during `exchangeOAuthToken`/`processAuthMiddleware`) is bypassed. Only the upstream's `session_token` is set. This means no cache layer: every page navigation triggers a full upstream `getSession` call, and if that returns an empty/redirected response, the client auto-signs-out
- `authClient.signOut()` is triggered from the `onError` callback in `hostedGetSession` in the SDK — if `getSession` fails (no session returned), the client auto-signs-out. Adding a retry with short delay before the `onError` fires could mitigate transient failures

## Relevant Files
- `app/api/auth/[...path]/route.ts`: Custom OAuth handlers (`handleOAuthExchange`, `proxyGoogleInitRedirect`, `proxyToUpstream`) and `rewriteSetCookieForLocalDomain`
- `proxy.ts`: Middleware matcher (`'/', '/((?!_next/static|_next/image|favicon.ico|auth|api).*)'`), `auth.middleware({ loginUrl: '/auth' })`
- `lib/auth/server.ts`: `getConfig()` — `sameSite: 'lax'`, no `domain` or `sessionDataTtl` set
- `lib/auth/client.ts`: `createAuthClient()` — plain SDK client
- `app/auth/page.tsx`: `handleGoogleAuth()` — synchronous `window.location.href = '/api/auth/google/init'`
- `node_modules/@neondatabase/auth/dist/next/server/index.mjs`: SDK internals — `mintSessionDataCookie` (300s default TTL, `sameSite` from config, `secure: true`), `exchangeOAuthToken` (checks verifier + challenge cookie locally before upstream call), `processAuthMiddleware`, `hostedGetSession`, `signOut`
- `app/sessions/page.tsx`, `app/chat/[id]/page.tsx`: Share API calls with silenced clipboard error
