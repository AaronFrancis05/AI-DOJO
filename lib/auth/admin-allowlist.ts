/**
 * Who may hold an admin account.
 *
 * `/auth/admin/signup` is unlinked, but an unlinked URL is not an access
 * control — anyone who guesses it would otherwise be able to mint themselves
 * an admin. The allowlist is the actual boundary: `ADMIN_EMAILS` is a
 * comma-separated list of addresses, set in the deployment environment where
 * a self-signup cannot reach it.
 *
 * Server-only. Never import this from a client component — the list of admin
 * addresses is not something to ship to the browser.
 */

/** Parsed fresh each call: the env var is read at request time on Vercel. */
function allowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether this address may be promoted to admin.
 *
 * Fails **closed**: an unset or empty `ADMIN_EMAILS` allows nobody. That is
 * deliberate — a missing env var must not turn the admin sign-up into an open
 * door, which is exactly the failure mode a fail-open default would create.
 * Existing admins are unaffected; this gates promotion, not sign-in.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowlist().includes(email.trim().toLowerCase());
}

/** Whether admin sign-up is usable at all in this deployment. */
export function adminSignupConfigured(): boolean {
  return allowlist().length > 0;
}
