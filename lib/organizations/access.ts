/**
 * Authorization for organization surfaces.
 *
 * Separate from `users.role`. A platform admin may run every organization
 * from the admin console. An organization admin may run only the organization
 * their membership names. Either check answers 404 when it fails, so a
 * learner cannot tell a console exists from the status code.
 */

import { and, eq } from 'drizzle-orm';
import { getAuthUser, getAuthUserReadOnly, RoleError } from '@/lib/auth/server';
import { toUserRole } from '@/lib/auth/roles';
import { db } from '@/src/db';
import { organizationMemberships, organizations, users } from '@/src/schema';
import { OrganizationError } from './membership';

export function organizationErrorResponse(err: unknown): Response {
  if (err instanceof RoleError || err instanceof OrganizationError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  throw err;
}

export async function requireOwnOrgAdmin() {
  const user = await getAuthUser();
  if (!user) throw new RoleError(401, 'Unauthorized');

  const [membership] = await db
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
      organizationName: organizations.name,
      isDefault: organizations.isDefault,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(and(
      eq(organizationMemberships.userId, user.id),
      eq(organizationMemberships.role, 'admin'),
    ))
    .limit(1);

  if (!membership) throw new RoleError(404, 'Not found');
  return { user, ...membership };
}

/** Page gate. Read-only so a render does not rotate the session cookie. */
export async function readOwnOrgAdmin() {
  const user = await getAuthUserReadOnly();
  if (!user?.id) return null;

  try {
    const [account] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (toUserRole(account?.role) === 'tutor') return null;

    const [membership] = await db
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(and(
        eq(organizationMemberships.userId, user.id),
        eq(organizationMemberships.role, 'admin'),
      ))
      .limit(1);
    return membership ? { userId: user.id, organizationId: membership.organizationId } : null;
  } catch (err) {
    console.error('[organization] admin read failed', err);
    return null;
  }
}
