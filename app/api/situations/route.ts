import { db } from '../../../src/db';
import { situations, domains } from '../../../src/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domainSlug = url.searchParams.get('domainSlug');

  let query = db.select().from(situations).orderBy(asc(situations.displayOrder));

  if (domainSlug) {
    const [domain] = await db.select().from(domains).where(eq(domains.slug, domainSlug));
    if (domain) {
      query = db
        .select()
        .from(situations)
        .where(eq(situations.domainId, domain.id))
        .orderBy(asc(situations.displayOrder)) as any;
    }
  }

  const list = await query;
  return Response.json({ success: true, situations: list });
}
