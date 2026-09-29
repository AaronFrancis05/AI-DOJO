import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { listRoster } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const admin = await requireOwnOrgAdmin();
    const members = await listRoster(admin.organizationId);
    return Response.json({
      success: true,
      organization: {
        id: admin.organizationId,
        name: admin.organizationName,
        isDefault: admin.isDefault,
      },
      members,
    });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
