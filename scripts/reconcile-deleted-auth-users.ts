/**
 * CLI for the Neon-Auth deletion sweep — `npm run db:reconcile-auth`.
 *
 * Pass `--dry-run` to see what would go without deleting anything. Do that
 * first on a database that has never been reconciled: accounts deleted in the
 * console *before* `users.auth_user_id` existed are indistinguishable from
 * pre-provisioned invitations and are deliberately left behind, so the list is
 * the only way to find out whether the sweep sees what you expect.
 *
 * See lib/auth/reconcile-deleted.ts for the guards.
 */
import 'dotenv/config';
import {
  AuthStoreUnavailableError,
  reconcileDeletedAuthUsers,
} from '../lib/auth/reconcile-deleted';

const dryRun = process.argv.includes('--dry-run');

try {
  const result = await reconcileDeletedAuthUsers({ dryRun });

  console.log(`Stamped auth ids on ${result.backfilled} existing row(s).`);

  if (result.orphans.length === 0) {
    console.log('✓ No accounts are missing their Neon Auth identity.');
    process.exit(0);
  }

  console.log(
    `\n${result.orphans.length} account(s) whose auth identity is gone:`,
  );
  for (const o of result.orphans) {
    console.log(`  - ${o.email} (${o.name || 'unnamed'}) — users.id ${o.id}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing was deleted. Re-run without it to purge.');
  } else {
    console.log(`\n✓ Deleted ${result.deleted} account(s) and everything that cascades from them.`);
  }
} catch (err) {
  if (err instanceof AuthStoreUnavailableError) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  throw err;
}
