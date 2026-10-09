import { db } from '../../../../src/db';
import { domains } from '../../../../src/schema';
import { getUserRole } from '@/lib/auth/server';
import { eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const [domain] = await db.select().from(domains).where(eq(domains.slug, slug));
  const includeArchived = (await getUserRole()) === 'admin';
  if (!domain || (!includeArchived && !domain.isActive)) {
    return Response.json({ success: false, error: 'Domain not found' }, { status: 404 });
  }

  return Response.json({ success: true, domain });
}
