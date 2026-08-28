/**
 * User roles.
 *
 * Kept in its own module rather than in `lib/auth/server.ts` because client
 * components need the type and the predicate: importing them from the server
 * module would drag the Drizzle client into the browser bundle.
 */

export const USER_ROLES = ['learner', 'tutor', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_ROLE: UserRole = 'learner';

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Narrows an unvalidated `users.role` to a known role. */
export function toUserRole(value: unknown): UserRole {
  return isUserRole(value) ? value : DEFAULT_ROLE;
}

/**
 * Whether `actual` is allowed where `required` is asked for.
 *
 * 'admin' satisfies every role. That is the whole hierarchy — roles here are
 * not a permission lattice, and pretending otherwise would mean every new
 * surface has to decide what a tutor can do to an admin's data.
 */
export function satisfiesRole(actual: UserRole, required: UserRole | UserRole[]): boolean {
  if (actual === 'admin') return true;
  const allowed = Array.isArray(required) ? required : [required];
  return allowed.includes(actual);
}
