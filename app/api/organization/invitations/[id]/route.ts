import { getAuthUser } from '@/lib/auth/server';
import { organizationErrorResponse } from '@/lib/organizations/access';
import { respondToInvitation } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const invitationId = Number(id);
    if (!Number.isInteger(invitationId)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const action = body && body.action === 'decline' ? 'decline' : body && body.action === 'accept' ? 'accept' : null;
    if (!action) return Response.json({ error: 'Choose accept or decline.' }, { status: 400 });

    await respondToInvitation(user.id, invitationId, action);
    return Response.json({ success: true });
  } catch (err) {
    return organizationErrorResponse(err);
  }
}
