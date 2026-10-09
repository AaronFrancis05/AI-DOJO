import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { deleteGroup, renameGroup } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOwnOrgAdmin();
    const { id } = await params;
    const groupId = Number(id);
    if (!Number.isInteger(groupId)) return Response.json({ error: 'Not found' }, { status: 404 });
    const body = await req.json().catch(() => null);
    const name = body && typeof body.name === 'string' ? body.name : '';
    const group = await renameGroup(admin.organizationId, groupId, name);
    return Response.json({ success: true, group });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOwnOrgAdmin();
    const { id } = await params;
    const groupId = Number(id);
    if (!Number.isInteger(groupId)) return Response.json({ error: 'Not found' }, { status: 404 });
    await deleteGroup(admin.organizationId, groupId);
    return Response.json({ success: true });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
