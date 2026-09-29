import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { organizationErrorResponse } from '@/lib/organizations/access';
import { appointAdministrator, OrganizationError } from '@/lib/organizations/membership';

export const runtime = 'nodejs';

/** Places an administrator directly. Used to bootstrap an organization, before anyone can send invitations. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const organizationId = Number(id);
    if (!Number.isInteger(organizationId)) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await req.json().catch(() => null);
    const email = body && typeof body.email === 'string' ? body.email : '';
    await appointAdministrator(organizationId, email);
    return Response.json({ success: true });
  } catch (err) {
    return err instanceof OrganizationError ? organizationErrorResponse(err) : roleErrorResponse(err);
  }
}
