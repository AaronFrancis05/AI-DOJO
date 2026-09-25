import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { addGroupMember, removeGroupMember } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOwnOrgAdmin();
    const { id } = await params;
    const groupId = Number(id);
    if (!Number.isInteger(groupId)) return Response.json({ error: 'Not found' }, { status: 404 });
    const body = await req.json().catch(() => null);
    const userId = body && typeof body.userId === 'string' ? body.userId : '';
    if (!userId) return Response.json({ error: 'A learner is required.' }, { status: 400 });
    await addGroupMember(admin.organizationId, groupId, userId);
    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireOwnOrgAdmin();
    const { id } = await params;
    const groupId = Number(id);
    if (!Number.isInteger(groupId)) return Response.json({ error: 'Not found' }, { status: 404 });
    const userId = new URL(req.url).searchParams.get('userId') ?? '';
    if (!userId) return Response.json({ error: 'A learner is required.' }, { status: 400 });
    await removeGroupMember(admin.organizationId, groupId, userId);
    return Response.json({ success: true });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
