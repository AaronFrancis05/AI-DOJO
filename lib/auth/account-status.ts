/**
 * Account access states.
 *
 * Kept beside `roles.ts` and for the same reason: client components need the
 * type and the predicate, and importing them from the server module would drag
 * the Drizzle client into the browser bundle.
 *
 * - `active`    — normal.
 * - `suspended` — access revoked, reversibly. Everything is kept; the account
 *                 simply cannot sign in or act. `getAuthUser()` enforces it.
 * - `deleted`   — soft-deleted: identity anonymised, foreign keys intact, so a
 *                 tutor's roster and the grades filed against the learner do
 *                 not change retroactively. Not reversible in the console.
 *
 * A row delete is a separate, guarded action (`.../purge`), not a status.
 */

export const ACCOUNT_STATUSES = ['active', 'suspended', 'deleted'] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const DEFAULT_ACCOUNT_STATUS: AccountStatus = 'active';

export function isAccountStatus(value: unknown): value is AccountStatus {
  return typeof value === 'string' && (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

/**
 * Narrows an unvalidated `users.status` to a known state.
 *
 * Unknown values degrade to `active`, matching `toUserRole`. The alternative —
 * treating anything unrecognised as blocked — would turn a typo in a migration
 * into a total lockout.
 */
export function toAccountStatus(value: unknown): AccountStatus {
  return isAccountStatus(value) ? value : DEFAULT_ACCOUNT_STATUS;
}
