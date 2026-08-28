import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { isAdminEmail } from '@/lib/auth/admin-allowlist';

export const runtime = 'nodejs';

/**
 * Promotes the signed-in account to admin, if its address is allowlisted.
 *
 * The counterpart to `/api/tutors/apply`: a role has to be *written* somewhere,
 * and `users.role` is what `requireRole('admin')` reads. The difference is who
 * decides — a tutor application is self-served and reviewed afterwards, an
 * admin promotion is decided in advance by `ADMIN_EMAILS` in the deployment
 * environment. The unlinked `/auth/admin/signup` URL is convenience, not the
 * gate; this is the gate.
 *
 * Called by both the admin sign-up and the admin sign-in page, because the
 * Neon project will not issue a session until the email is verified — so the
 * first moment a fresh admin actually *has* a session may well be their second
 * visit. Idempotent for that reason.
 *
 * `onboardingCompletedAt` is stamped here on purpose. The (app) gate sends an
 * un-onboarded account to a wizard that asks for a practice level, a goal and
 * a daily target — none of which an admin console reads, and none of which an
 * admin should have to invent to reach it.
 */
export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    // 403, not 404: the caller is signed in and asked about their own account,
    // so there is nothing to conceal from them — and "your address is not on
    // the list" is the only message that tells them what to do next.
    return Response.json(
      { error: 'This address is not authorised for admin access.' },
      { status: 403 },
    );
  }

  const [row] = await db
    .select({ role: users.role, onboardingCompletedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row) {
    return Response.json({ error: 'Account not found' }, { status: 404 });
  }

  if (row.role !== 'admin' || row.onboardingCompletedAt === null) {
    await db
      .update(users)
      .set({
        role: 'admin',
        onboardingCompletedAt: row.onboardingCompletedAt ?? new Date(),
      })
      .where(eq(users.id, user.id));
  }

  return Response.json({ success: true, role: 'admin' });
}
