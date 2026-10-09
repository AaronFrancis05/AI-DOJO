import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { organizations } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';

export const runtime = 'nodejs';

/**
 * Per-organization feature switches. Today only one: hybrid tutoring
 * (PLAN.md 4.5), which an admin turns on for the pilot customer first. It
 * has no effect while NEXT_PUBLIC_HYBRID_ENABLED is off.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const organizationId = Number((await params).id);
  if (!Number.isInteger(organizationId)) {
    return Response.json({ error: 'Invalid organization id' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.hybridTutoringEnabled !== 'boolean') {
    return Response.json({ error: 'hybridTutoringEnabled must be true or false' }, { status: 400 });
  }

  const [updated] = await db
    .update(organizations)
    .set({ hybridTutoringEnabled: body.hybridTutoringEnabled })
    .where(eq(organizations.id, organizationId))
    .returning({ id: organizations.id, hybridTutoringEnabled: organizations.hybridTutoringEnabled });
  if (!updated) return Response.json({ error: 'Organization not found' }, { status: 404 });

  return Response.json({ success: true, organization: updated });
}
