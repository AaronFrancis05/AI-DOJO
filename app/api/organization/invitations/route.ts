import { createNotification } from '@/lib/notifications';
import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { listOrgInvitations, sendInvitation } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const admin = await requireOwnOrgAdmin();
    const invitations = await listOrgInvitations(admin.organizationId);
    return Response.json({ success: true, invitations });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireOwnOrgAdmin();
    const body = await req.json().catch(() => null);
    const email = body && typeof body.email === 'string' ? body.email : '';
    const sent = await sendInvitation({
      destinationOrganizationId: admin.organizationId,
      invitedByUserId: admin.user.id,
      email,
    });

    await createNotification({
      userId: sent.learnerId,
      type: 'organization_invite',
      title: `Invitation to ${sent.organizationName}`,
      body: `Accept to join ${sent.organizationName}.`,
      href: '/organization/invitations',
    });

    return Response.json({ success: true, invitationId: sent.invitationId }, { status: 201 });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
