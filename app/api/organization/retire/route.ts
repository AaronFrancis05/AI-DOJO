import { organizationErrorResponse, requireOwnOrgAdmin } from '@/lib/organizations/access';
import { retireLearner } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const admin = await requireOwnOrgAdmin();
    const body = await req.json().catch(() => null);
    const userId = body && typeof body.userId === 'string' ? body.userId : '';
    if (!userId) return Response.json({ error: 'A learner is required.' }, { status: 400 });
    await retireLearner(admin.organizationId, userId);
    return Response.json({ success: true });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
