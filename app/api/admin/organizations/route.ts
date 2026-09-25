import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { organizationErrorResponse } from '@/lib/organizations/access';
import { createOrganization, listOrganizations, OrganizationError } from '@/lib/organizations/membership';
import { slugFromName } from '@/lib/organizations/rules';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireRole('admin');
    const organizations = await listOrganizations();
    return Response.json({ success: true, organizations });
  } catch (err) {
    return err instanceof OrganizationError ? organizationErrorResponse(err) : roleErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole('admin');
    const body = await req.json().catch(() => null);
    const name = body && typeof body.name === 'string' ? body.name : '';
    const requested = body && typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const slug = requested || slugFromName(name);
    const organization = await createOrganization(name, slug);
    return Response.json({ success: true, organization }, { status: 201 });
  } catch (err) {
    return err instanceof OrganizationError ? organizationErrorResponse(err) : roleErrorResponse(err);
  }
}
