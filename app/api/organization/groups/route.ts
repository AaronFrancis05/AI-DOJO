import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { createGroup, listGroups } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const admin = await requireOwnOrgAdmin();
    const groups = await listGroups(admin.organizationId);
    return Response.json({ success: true, groups });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireOwnOrgAdmin();
    const body = await req.json().catch(() => null);
    const name = body && typeof body.name === 'string' ? body.name : '';
    const group = await createGroup(admin.organizationId, name);
    return Response.json({ success: true, group }, { status: 201 });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
