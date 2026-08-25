import type { UserContextValue } from './user-context';

// Rows stamped by the old `?? 'Learner'` fallback before it was removed are
// treated as unnamed so the name prompt reaches them too.
const LEGACY_PLACEHOLDER = 'learner';

/**
 * The signed-in account's stored display name — or '' when it has none.
 *
 * Deliberately never invents an identity (no email local-part, no 'You'):
 * an unnamed account is asked for its real name once (NamePromptDialog),
 * which persists through Neon Auth and lib/auth/sync-user.ts.
 */
export function resolveDisplayName(
  user: Pick<UserContextValue, 'name'> | null | undefined,
): string {
  const name = user?.name?.trim();
  if (!name || name.toLowerCase() === LEGACY_PLACEHOLDER) return '';
  return name;
}
