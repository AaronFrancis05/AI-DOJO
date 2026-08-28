import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import {
  AuthStoreUnavailableError,
  reconcileDeletedAuthUsers,
} from '@/lib/auth/reconcile-deleted';

export const runtime = 'nodejs';

/**
 * Sweeps app accounts whose Neon Auth identity has been deleted.
 *
 * The on-demand counterpart of the `auth/reconcile-deleted-users` Inngest cron —
 * for when an admin has just deleted someone in the Neon console and wants their
 * data gone now rather than at the next sweep. Both call the same function; see
 * `lib/auth/reconcile-deleted.ts` for why it is safe to run unattended.
 *
 * `{ "dryRun": true }` reports what would go without touching anything, which is
 * the right first call on a database nobody has reconciled before.
 */
export async function POST(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  const dryRun = body?.dryRun === true;

  try {
    const result = await reconcileDeletedAuthUsers({ dryRun });
    return Response.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof AuthStoreUnavailableError) {
      // 503, not 500: nothing is wrong with the request, the auth store just
      // cannot be trusted to say who still exists right now.
      return Response.json({ error: err.message }, { status: 503 });
    }
    console.error('[admin/users/reconcile] failed', err);
    return Response.json({ error: 'Reconcile failed' }, { status: 500 });
  }
}
