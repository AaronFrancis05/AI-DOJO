import { getAuthUser } from '@/lib/auth/server';
import { promoteAllowlistedAdmin } from '@/lib/auth/claim-admin';

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
 * Called by the admin password door *and* (via `promoteAllowlistedAdmin`) the
 * Google OAuth callback. Neon will not issue a session until the email is
 * verified, so the first moment a fresh admin actually *has* a session may
 * well be their second visit. Idempotent for that reason.
 */
export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await promoteAllowlistedAdmin(user.id, user.email);

  if (result === 'denied') {
    // 403, not 404: the caller is signed in and asked about their own account,
    // so there is nothing to conceal from them — and "your address is not on
    // the list" is the only message that tells them what to do next.
    return Response.json(
      { error: 'This address is not authorised for admin access.' },
      { status: 403 },
    );
  }

  if (result === 'not_found') {
    return Response.json({ error: 'Account not found' }, { status: 404 });
  }

  return Response.json({ success: true, role: 'admin' });
}
