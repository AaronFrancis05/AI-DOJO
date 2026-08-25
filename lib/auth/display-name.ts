import type { UserContextValue } from './user-context';

/**
 * The name to show for the signed-in user, resolved honestly:
 * stored display name → email local-part → neutral "You".
 *
 * A missing name must never read as a fake identity (the old `?? 'Learner'`
 * fallbacks made a signed-in user look like an anonymous placeholder).
 */
export function resolveDisplayName(
  user: Pick<UserContextValue, 'name' | 'email'> | null | undefined,
): string {
  const name = user?.name?.trim();
  if (name) return name;
  const emailLocal = user?.email?.split('@')[0]?.trim();
  return emailLocal || 'You';
}
