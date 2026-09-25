import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { revokeInvitation } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOwnOrgAdmin();
    const { id } = await params;
    const invitationId = Number(id);
    if (!Number.isInteger(invitationId)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    await revokeInvitation(admin.organizationId, invitationId);
    return Response.json({ success: true });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
