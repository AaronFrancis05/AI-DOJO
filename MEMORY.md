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
- Clipboard `NotAllowedError` silenced with `.catch(() => {})`
- **Mobile OAuth session drop fix**: `handleOAuthExchange` now routes through `builtin.GET!()` (SDK handler) instead of raw upstream fetch, so `mintSessionDataCookie()` runs and `__Secure-neon-auth.local.session_data` cookie is created on successful OAuth login
- **`refetchOnWindowFocus` disabled** in `lib/auth/client.ts` via `sessionOptions: { refetchOnWindowFocus: false }` — mobile browsers no longer re-validate session on every tab-switch after OAuth redirect
- Sign-out diagnostic logging added to `handlePOST` for `sign-out` path

### Blocked
- **Sign-out source still unresolved**: log-capture from real mobile device needed to identify the caller of `POST /api/auth/sign-out`

## Key Decisions
- **`handleOAuthExchange` now proxies through built-in handler (`builtin.GET!()`)**: instead of hand-rolling `fetch(${baseUrl}/get-session)`, passes request to SDK's `handleAuthProxyRequest` which calls `handleAuthResponse` → `mintSessionDataFromResponse` → `mintSessionDataCookie`. This ensures `session_data` cache cookie is minted on OAuth login. Custom redirect to `/` is preserved via `responseHeaders.set('Location', '/')`.
- **`lib/auth/client.ts` uses vanilla `createAuthClient` from `@neondatabase/auth`** (not `@neondatabase/auth/next`): the Next.js wrapper doesn't accept options, so we use the vanilla entry which accepts `BetterAuthReactAdapter({ sessionOptions })`. The URL is passed as `''` (relative — auto-detected from page origin at runtime). Return type is `ReactBetterAuthClient` which includes all hooks.
- **`SameSite=Lax` hardcoded in `rewriteSetCookieForLocalDomain`**: chosen for top-level navigation compatibility; may need `None; Secure` if cross-site redirects cause cookie drops
- **Synchronous redirect for OAuth init** (`window.location.href = '/api/auth/google/init'`): avoids async fetch losing user gesture on mobile (replaced `authClient.signIn.social()`)
- **All `/api/*` excluded from middleware**: prevents API fetch responses being HTML login pages; API routes handle auth internally via `getAuthUser()`

## Next Steps
1. Deploy to preview environment and test OAuth login on real mobile devices (iOS Safari, Android Chrome)
2. Confirm `__Secure-neon-auth.local.session_data` cookie is present in callback response after OAuth login (inspect Set-Cookie headers)
3. Check server logs for the diagnostic sign-out logging to identify the caller of `POST /api/auth/sign-out`
4. If the sign-out is triggered by browser tab-resume (iOS Safari replaying in-flight requests), consider adding a user-agent check to suppress duplicate sign-out requests
5. If the automatic sign-out is confirmed to be from `better-auth` client's session error handling (and not a manual click), consider wrapping `signOut()` calls with a guard

## Findings from SDK Source Investigation

### No `hostedGetSession` function exists
The function `hostedGetSession` does NOT exist anywhere in `@neondatabase/auth` v0.4.2-beta or `better-auth` v1.4.18. The `MEMORY.md` prior notes referencing it were incorrect. What exists instead:
- `processAuthMiddleware` — middleware-level OAuth verifier exchange and session check
- `getSession` — API handler that proxies to upstream `/get-session` and caches via `session_data` cookie
- Client-side session refresh via `session-refresh.mjs`

### No automatic `signOut()` call found in SDK
Full search of the SDK's bundled client code (adapter-core, session-refresh, query hooks) found **no code path that calls `signOut()` automatically on session check failure**. The only `signOut()` calls in the codebase are manual (button click in `NavBar.tsx` and `profile/page.tsx`). The sign-out source remains unresolved and requires diagnostic logging on a real device.

### `session_data` cookie minting chain
The SDK mints `session_data` through: `handleAuthResponse` → `mintSessionDataFromResponse` → `mintSessionDataCookie`. This function:
- Cookie name: `__Secure-neon-auth.local.session_data`
- Default TTL: 300 seconds (configurable via `cookies.sessionDataTtl`)
- Signs session data into a JWT using `jose` `SignJWT` with `HS256`
- Cookie flags: `Path=/`, `HttpOnly`, `Secure`, `SameSite` from config (default `strict`)
- Only created when upstream `/get-session` response includes a `session_token` Set-Cookie

### `exchangeOAuthToken` is middleware-only (not API handler)
The OAuth verifier exchange (`exchangeOAuthToken`) is handled exclusively by `processAuthMiddleware`, NOT by `authApiHandler` (the built-in handler). The API handler has NO `callback/oauth` route. The only way `exchangeOAuthToken` runs is through middleware interception of page routes. Our custom handler at `/api/auth/oauth/callback` (excluded from middleware) must proxy through the built-in handler's `get-session` path to trigger `mintSessionDataCookie`.

### `BetterAuthReactAdapter` option forwarding
`BetterAuthReactAdapter(options)` spreads `options` into `BetterAuthReactAdapterImpl(betterAuthClientOptions)`, which feeds into `NeonAuthAdapterCore`. `NeonAuthAdapterCore` spreads `betterAuthClientOptions` into `this.betterAuthOptions`, which is passed to `better-auth/react`'s `createAuthClient`. Any property in `options` (including `sessionOptions`) is forwarded if it matches `BetterAuthClientOptions`. The Next.js wrapper (`@neondatabase/auth/next`'s `createAuthClient`) does NOT forward any options — it calls `BetterAuthReactAdapter()` with zero arguments.

## Critical Context
- **Two domains in Vercel logs**: production alias `ai-dojo-opal.vercel.app` and preview URL `ai-dojo-<hash>-taremwa-aaron-francis-projects.vercel.app` — session set on one domain won't be sent to the other
- `session_data` cookie (signed JWT, 300s default TTL) is minted by SDK middleware during `exchangeOAuthToken`/`processAuthMiddleware`; `session_token` cookie (from upstream) has upstream's Max-Age preserved
- `proxyOAuthInitRedirect` (for `GET sign-in/social/init`) uses `redirect: 'manual'` to capture Set-Cookie headers from the upstream's 307 redirect; `proxyToUpstream` (for `POST sign-in/social`) uses default `'follow'`
- `rewriteSetCookieForLocalDomain` preserves `Max-Age` and `Expires` from upstream — short upstream session TTL would cause early expiry; also preserves `Secure` for `__Secure-`-prefixed cookies, strips it otherwise
- `proxyGoogleInitRedirect` constructs synthetic POST to `proxyToUpstream` with hardcoded `callbackURL: '/api/auth/oauth/callback'` and `redirect: 'manual'` — upstream resolves this to absolute URL using `Origin` header (set to incoming request origin)
- Cookie `Domain` attribute is always stripped by `rewriteSetCookieForLocalDomain`; no domain is set — cookie scoped to request origin. The SDK's `prepareResponseHeaders` does NOT strip Domain if `cookieConfig.domain` is unset (it preserves upstream's Domain in that case), but since upstream doesn't set Domain, both approaches produce the same result.
- `SameSite=Lax` is hardcoded in all rewritten cookies — sufficient for same-site top-level navigation; may need `None; Secure` if cross-site redirects cause cookie drops
- The `session_data` cookie is now properly minted by routing `handleOAuthExchange` through `builtin.GET!()` with path `['get-session']`, which goes through `handleAuthProxyRequest` → `handleAuthResponse` → `mintSessionDataFromResponse` → `mintSessionDataCookie`. The `session_data` cache cookie prevents fragile upstream calls on every navigation.

## Relevant Files
- `app/api/auth/[...path]/route.ts`: Custom OAuth handlers (`handleOAuthExchange`, `proxyGoogleInitRedirect`, `proxyToUpstream`) and `rewriteSetCookieForLocalDomain`; `handleOAuthExchange` now routes through `builtin.GET!()` for proper `session_data` cookie minting
- `proxy.ts`: Middleware matcher (`'/', '/((?!_next/static|_next/image|favicon.ico|auth|api).*)'`), `auth.middleware({ loginUrl: '/auth' })`
- `lib/auth/server.ts`: `getConfig()` — `sameSite: 'lax'`, no `domain` or `sessionDataTtl` set
- `lib/auth/client.ts`: Now uses `@neondatabase/auth` (vanilla) with `BetterAuthReactAdapter({ sessionOptions: { refetchOnWindowFocus: false } })` — disables focus-triggered session refetching that exacerbates session check race on mobile
- `app/auth/page.tsx`: `handleGoogleAuth()` — synchronous `window.location.href = '/api/auth/google/init'`
- `node_modules/@neondatabase/auth/dist/next/server/index.mjs`: SDK internals — `mintSessionDataCookie` (300s default TTL, `sameSite` from config, `secure: true`), `exchangeOAuthToken` (checks verifier + challenge cookie locally before upstream call), `processAuthMiddleware`, `handleAuthResponse`, `authApiHandler`
- `app/sessions/page.tsx`, `app/chat/[id]/page.tsx`: Share API calls with silenced clipboard error
