import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { isAdminEmail } from './admin-allowlist';

export type PromoteAdminResult = 'claimed' | 'denied' | 'not_found';

/**
 * Write admin onto an allowlisted account.
 *
 * Shared by `POST /api/auth/admin/claim` (password door) and the Google
 * OAuth callback so the two cannot drift: `users.role` is what
 * `requireRole('admin')` reads, and `ADMIN_EMAILS` is who may receive it.
 *
 * `onboardingCompletedAt` is stamped on purpose. The (app) gate sends an
 * un-onboarded account to a wizard that asks for a practice level, a goal
 * and a daily target — none of which an admin console reads.
 */
export async function promoteAllowlistedAdmin(
  userId: string,
  email: string | null | undefined,
): Promise<PromoteAdminResult> {
  if (!isAdminEmail(email)) return 'denied';

  const [row] = await db
    .select({ role: users.role, onboardingCompletedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return 'not_found';

  if (row.role !== 'admin' || row.onboardingCompletedAt === null) {
    await db
      .update(users)
      .set({
        role: 'admin',
        onboardingCompletedAt: row.onboardingCompletedAt ?? new Date(),
      })
      .where(eq(users.id, userId));
  }

  return 'claimed';
}
