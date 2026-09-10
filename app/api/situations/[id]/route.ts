import { db } from '../../../../src/db';
import { domains, situations } from '../../../../src/schema';
import { getUserRole } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return Response.json({ success: false, error: 'Invalid situation ID' }, { status: 400 });
  }

  const [situation] = await db.select().from(situations).where(eq(situations.id, numericId));
  if (!situation) {
    return Response.json({ success: false, error: 'Situation not found' }, { status: 404 });
  }

  const includeArchived = (await getUserRole()) === 'admin';
  if (!includeArchived) {
    if (!situation.isActive) {
      return Response.json({ success: false, error: 'Situation not found' }, { status: 404 });
    }
    const [domain] = await db
      .select({ isActive: domains.isActive })
      .from(domains)
      .where(eq(domains.id, situation.domainId))
      .limit(1);
    if (!domain?.isActive) {
      return Response.json({ success: false, error: 'Situation not found' }, { status: 404 });
    }
  }

  return Response.json({ success: true, situation });
}
