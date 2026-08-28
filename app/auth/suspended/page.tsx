import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { Card } from '@/components/ui/Card';
import { AlertCircleIcon } from '@/components/Icons';

export const metadata = { title: 'Account access · AI DOJO' };

/**
 * Where a suspended or deleted account lands.
 *
 * The `(app)` layout redirects here rather than to `/auth`, because bouncing
 * someone to a sign-in page they can sign into — the credentials are still
 * valid, `getAuthUser()` is what refuses them — is a loop with no explanation
 * in it. This page is the explanation.
 *
 * It reads the row directly instead of through `getAuthUser()`, which returns
 * null for exactly the accounts this page exists to serve.
 */
export default async function SuspendedPage() {
  const authUser = await getAuthUserReadOnly();
  const u = authUser as { id?: string; email?: string } | null;

  let status: string | null = null;
  let reason: string | null = null;

  if (u?.id) {
    try {
      const [row] = await db
        .select({ status: users.status, suspendedReason: users.suspendedReason })
        .from(users)
        .where(eq(users.id, u.id))
        .limit(1);
      status = row?.status ?? null;
      reason = row?.suspendedReason ?? null;
    } catch {
      // Nothing to add — the generic copy below still says the right thing.
    }
  }

  const deleted = status === 'deleted';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-dojo-canvas px-4 py-16">
      <Card raised className="w-full max-w-md !p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dojo-danger/10">
            <AlertCircleIcon className="h-5 w-5 text-dojo-danger" />
          </div>
          <h1 className="text-xl font-bold leading-none tracking-tight text-dojo-text-primary">
            {deleted ? 'This account was closed' : 'Your access is paused'}
          </h1>
        </div>

        <p className="mt-4 text-base leading-relaxed text-dojo-text-muted">
          {deleted
            ? 'This account has been closed by an administrator. Your practice history is kept, but you can no longer sign in to it.'
            : 'An administrator has paused access to your account. Your progress, sessions and grades are all still here and nothing has been deleted.'}
        </p>

        {reason && (
          <div className="mt-4 rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-dojo-text-muted">
              Reason given
            </p>
            <p className="mt-1 text-sm leading-relaxed text-dojo-text-primary">{reason}</p>
          </div>
        )}

        <p className="mt-6 text-sm leading-relaxed text-dojo-text-muted">
          If you think this is a mistake, reply to the email your account was registered
          with and an administrator will take another look.
        </p>

        <Link
          href="/"
          className="mt-6 inline-block text-sm font-semibold text-dojo-accent hover:underline"
        >
          Back to the home page
        </Link>
      </Card>
    </main>
  );
}
