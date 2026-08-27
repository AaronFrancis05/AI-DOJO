/**
 * Removes app accounts whose Neon Auth identity no longer exists.
 *
 * Deleting a user in the Neon Auth console (or anywhere else that writes to
 * `neon_auth."user"`) removes the *credential*. It does not touch `public.users`,
 * so without this the row and everything hanging off it — sessions,
 * conversations, evaluations, SRS cards, enrolments, calendar tasks — survives
 * its own account, keeps counting toward the leaderboard, and is handed straight
 * back to whoever next signs up with that email, because `syncUser()` matches on
 * the address.
 *
 * Deleting the `users` row is enough to erase the rest: every table that
 * references `users.id` declares `ON DELETE CASCADE` (or `SET NULL`, for
 * `chat_messages.sender_id`, which deliberately leaves other people's rooms
 * readable with an authorless message rather than tearing holes in them).
 *
 * ## What makes this safe to run unattended
 *
 * `users.auth_user_id` is the key, not the email and not `users.id`. A row with
 * no `auth_user_id` has never been claimed by an auth identity — a
 * pre-provisioned invitation from `/api/admin/users/create`, or a seeded
 * account — and is left alone. Only a row that *had* an identity and lost it is
 * a genuine orphan.
 *
 * Two further guards, because an unattended sweep that gets it wrong deletes
 * every learner in the product:
 *
 * 1. `neon_auth."user"` must exist and be readable. A missing table means the
 *    auth schema was renamed or the role lost its grant, not that every account
 *    was deleted — so it throws instead of proceeding.
 * 2. It must be non-empty. An empty auth table is a reset or a wrong database.
 *    Nobody legitimately deletes every account at once, so that aborts too.
 *
 * The reverse direction (deleting in the app) is handled at the source, by
 * `POST /api/admin/users/[id]/purge`.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db';

export interface OrphanedAccount {
  id: string;
  email: string;
  name: string;
  authUserId: string;
}

export interface ReconcileResult {
  /** Rows stamped with their live auth id by the backfill pass. */
  backfilled: number;
  /** Accounts whose auth identity is gone — deleted, unless `dryRun`. */
  orphans: OrphanedAccount[];
  deleted: number;
  dryRun: boolean;
}

/** Raised when the auth store cannot be trusted to answer "who still exists?". */
export class AuthStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthStoreUnavailableError';
  }
}

async function assertAuthStoreUsable(): Promise<number> {
  let rows;
  try {
    rows = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from neon_auth."user"`,
    );
  } catch (err) {
    throw new AuthStoreUnavailableError(
      `neon_auth."user" is not readable — refusing to reconcile: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const total = Number(rows.rows[0]?.total ?? 0);
  if (total === 0) {
    throw new AuthStoreUnavailableError(
      'neon_auth."user" is empty — refusing to reconcile, since that would delete every account.',
    );
  }
  return total;
}

/**
 * Stamps `auth_user_id` on rows that match a *live* auth identity by id or
 * email but were written before the column existed (or by the admin console's
 * pre-provision route, which is claimed on first sign-in).
 *
 * Only ever writes an id that exists right now, so it can never manufacture the
 * orphan it is about to look for. Rows whose auth identity was already deleted
 * before this ran stay NULL and are left alone — they are indistinguishable from
 * an unclaimed invitation, and guessing wrong is not recoverable. Clear those
 * from the admin console's purge instead.
 */
async function backfillAuthUserIds(): Promise<number> {
  // Two passes rather than one `a.id = u.id OR email = email`, so neither can
  // hand the same auth id to two rows and trip `uq_users_auth_user_id`. The id
  // pass joins primary key to primary key and is strictly 1:1; the email pass
  // runs second, over what the first left, and `users.email` is unique.
  const byId = await db.execute(sql`
    update users u
       set auth_user_id = a.id
      from neon_auth."user" a
     where u.auth_user_id is null
       and a.id = u.id
       and not exists (select 1 from users u2 where u2.auth_user_id = a.id)
  `);
  const byEmail = await db.execute(sql`
    update users u
       set auth_user_id = a.id
      from neon_auth."user" a
     where u.auth_user_id is null
       and lower(a.email) = lower(u.email)
       and not exists (select 1 from users u2 where u2.auth_user_id = a.id)
  `);
  return (byId.rowCount ?? 0) + (byEmail.rowCount ?? 0);
}

/** Accounts whose stamped auth identity is no longer in `neon_auth."user"`. */
export async function findOrphanedAccounts(): Promise<OrphanedAccount[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    select u.id, u.email, u.name, u.auth_user_id as "authUserId"
      from users u
     where u.auth_user_id is not null
       and not exists (
             select 1 from neon_auth."user" a where a.id = u.auth_user_id
           )
     order by u.created_at
  `);
  return result.rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    authUserId: String(r.authUserId),
  }));
}

export async function reconcileDeletedAuthUsers(
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ReconcileResult> {
  await assertAuthStoreUsable();

  const backfilled = await backfillAuthUserIds();
  const orphans = await findOrphanedAccounts();

  if (dryRun || orphans.length === 0) {
    return { backfilled, orphans, deleted: 0, dryRun };
  }

  // One statement, so a row that signs back in mid-sweep is re-stamped by
  // syncUser() against a fresh read rather than deleted from a stale list.
  const result = await db.execute(sql`
    delete from users u
     where u.auth_user_id is not null
       and not exists (
             select 1 from neon_auth."user" a where a.id = u.auth_user_id
           )
  `);

  return { backfilled, orphans, deleted: result.rowCount ?? 0, dryRun };
}
