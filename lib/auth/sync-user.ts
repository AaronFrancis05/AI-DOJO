import { db } from '@/src/db';
import { users } from '@/src/schema';
import { eq, or } from 'drizzle-orm';
import { ensureLearnerMembership } from '@/lib/organizations/membership';

export type AuthUser = {
  id: string;
  email: string;
  // Optional on purpose: the auth provider's metadata may carry no display
  // name (email-link signups, OAuth without a name claim). A missing name is
  // NEVER a reason to write a placeholder over an existing display name.
  name?: string | null;
};

function realName(name: string | null | undefined): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed;
}

/** Membership is repaired on every sign-in. A failure here must not block the session. */
async function placeLearner(userId: string): Promise<void> {
  try {
    await ensureLearnerMembership(userId);
  } catch (err) {
    console.error('[sync-user] organization membership failed', err);
  }
}

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  return (err as { code?: string } | null)?.code === '23505' || cause?.code === '23505';
}

const identityColumns = {
  id: users.id,
  email: users.email,
  authUserId: users.authUserId,
};

/**
 * The auth id is the usual key. Email is the fallback for a provider-key
 * rotation, where the id is reissued and the address is what still matches.
 * Email cannot be the only key: a confirmed address change would miss the
 * row and insert a second account, splitting sessions off the person.
 */
async function findExistingUser(authUser: AuthUser) {
  const [byIdentity] = await db
    .select(identityColumns)
    .from(users)
    .where(or(eq(users.authUserId, authUser.id), eq(users.id, authUser.id))!)
    .limit(1);
  if (byIdentity) return byIdentity;

  const email = authUser.email.trim();
  if (!email) return undefined;
  const [byEmail] = await db
    .select(identityColumns)
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return byEmail;
}

export async function syncUser(authUser: AuthUser): Promise<string> {
  const existing = await findExistingUser(authUser);

  if (existing) {
    // Keep the existing id so FK refs from sessions stay intact. Only touch
    // the display name when the provider actually has one — previously this
    // wrote the caller's fallback string (e.g. 'Learner') over real names.
    const name = realName(authUser.name);
    // Stamp the auth identity if it is missing or has moved (a provider key
    // rotation reissues ids). Without it the row looks like an unclaimed
    // invitation to reconcileDeletedAuthUsers() and outlives its own account.
    const authUserId = existing.authUserId !== authUser.id ? authUser.id : undefined;
    const nextEmail = authUser.email.trim();
    const email = nextEmail && existing.email !== nextEmail ? nextEmail : undefined;
    if (name || authUserId || email) {
      try {
        await db
          .update(users)
          .set({
            ...(name ? { name } : {}),
            ...(authUserId ? { authUserId } : {}),
            ...(email ? { email } : {}),
          })
          .where(eq(users.id, existing.id));
      } catch (err) {
        // Another account already holds the new address. Stay on this row
        // rather than inserting a duplicate under the new address.
        if (!(email && isUniqueViolation(err))) throw err;
        console.error('[sync-user] email change collided with another account', existing.id);
      }
    }
    await placeLearner(existing.id);
    return existing.id;
  }

  // New user — insert with the auth provider's id. The column is notNull, so
  // an absent name inserts as '' rather than inventing an identity.
  await db.insert(users).values({
    id: authUser.id,
    authUserId: authUser.id,
    name: realName(authUser.name),
    email: authUser.email,
  });
  await placeLearner(authUser.id);
  return authUser.id;
}
