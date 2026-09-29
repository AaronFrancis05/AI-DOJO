import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { listGroups, listProgress } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const admin = await requireOwnOrgAdmin();
    const groupIdRaw = new URL(req.url).searchParams.get('groupId');
    const groupId = groupIdRaw ? Number(groupIdRaw) : undefined;
    if (groupIdRaw && !Number.isInteger(groupId)) {
      return Response.json({ error: 'Unknown group.' }, { status: 400 });
    }
    const [progress, groups] = await Promise.all([
      listProgress(admin.organizationId, groupId),
      listGroups(admin.organizationId),
    ]);
    return Response.json({ success: true, progress, groups });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
