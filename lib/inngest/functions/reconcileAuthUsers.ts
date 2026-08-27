import { inngest } from '@/lib/inngest/client';
import {
  AuthStoreUnavailableError,
  reconcileDeletedAuthUsers,
} from '@/lib/auth/reconcile-deleted';

type StepTools = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

/**
 * Hourly sweep for accounts deleted in the Neon Auth console.
 *
 * A deletion there removes the credential and nothing else, and — unlike an
 * in-app purge — the app is never told it happened. There is no webhook and no
 * sign-in to hook onto (a deleted identity cannot sign in), so a poll is the
 * only way the app learns. Hourly because the window it leaves is a deleted
 * account's data still counting toward leaderboards, not a security hole:
 * `getAuthUser()` already refuses anyone without a live session.
 *
 * `retries: 0` on purpose. The failure mode worth having is
 * `AuthStoreUnavailableError` — the auth store cannot be read, or is empty —
 * and retrying that just re-asks a question the next hour will ask anyway.
 */
export const reconcileAuthUsers = inngest.createFunction(
  {
    id: 'reconcile-deleted-auth-users',
    triggers: { cron: '17 * * * *' },
    retries: 0 as const,
    concurrency: { limit: 1 },
  },
  async ({ step }: { step: StepTools }) => {
    return step.run('reconcile', async () => {
      try {
        const result = await reconcileDeletedAuthUsers();
        if (result.deleted > 0 || result.backfilled > 0) {
          console.log(
            `[reconcile-auth] backfilled=${result.backfilled} deleted=${result.deleted}`,
            result.orphans.map((o) => o.email),
          );
        }
        return result;
      } catch (err) {
        if (err instanceof AuthStoreUnavailableError) {
          console.error('[reconcile-auth] skipped:', err.message);
          return { skipped: err.message };
        }
        throw err;
      }
    });
  },
);
