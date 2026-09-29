import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { OrganizationError } from '@/lib/organizations/membership';
import { grantOrganizationTutor, listOrganizationTutorPermissions } from '@/lib/organizations/tutor-access';

export const runtime = 'nodejs';

function refusePublicOrg(isDefault: boolean) {
  if (isDefault) throw new OrganizationError(404, 'Not found');
}

export async function GET() {
  try {
    const admin = await requireOwnOrgAdmin();
    refusePublicOrg(admin.isDefault);
    const tutors = await listOrganizationTutorPermissions(admin.organizationId);
    return Response.json({ success: true, ...tutors });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireOwnOrgAdmin();
    refusePublicOrg(admin.isDefault);
    const body = await req.json().catch(() => null);
    const tutorId = Number(body && typeof body === 'object' ? body.tutorId : NaN);
    if (!Number.isInteger(tutorId)) throw new OrganizationError(404, 'Not found');
    await grantOrganizationTutor(admin.organizationId, tutorId);
    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
