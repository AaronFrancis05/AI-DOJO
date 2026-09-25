import { getAuthUser } from '@/lib/auth/server';
import { organizationErrorResponse } from '@/lib/organizations/access';
import { listMyGroups, listMyInvitations, loadMembership } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

/** The signed-in learner's organization, groups, and pending invitations. */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await loadMembership(user.id);
    const [groups, invitations] = await Promise.all([
      membership ? listMyGroups(user.id, membership.organizationId) : Promise.resolve([]),
      listMyInvitations(user.id),
    ]);

    return Response.json({
      success: true,
      organization: membership
        ? {
            id: membership.organizationId,
            name: membership.organizationName,
            isDefault: membership.isDefault,
            role: membership.role,
          }
        : null,
      groups,
      invitations,
    });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
