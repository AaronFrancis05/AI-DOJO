import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { OrganizationError } from '@/lib/organizations/membership';
import { revokeOrganizationTutor } from '@/lib/organizations/tutor-access';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ tutorId: string }> }) {
  try {
    const admin = await requireOwnOrgAdmin();
    if (admin.isDefault) throw new OrganizationError(404, 'Not found');
    const tutorId = Number((await params).tutorId);
    if (!Number.isInteger(tutorId)) throw new OrganizationError(404, 'Not found');
    await revokeOrganizationTutor(admin.organizationId, tutorId);
    return Response.json({ success: true });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
