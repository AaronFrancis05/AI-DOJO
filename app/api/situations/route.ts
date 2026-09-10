import { db } from '../../../src/db';
import { situations, domains } from '../../../src/schema';
import { getUserRole } from '@/lib/auth/server';
import { and, eq, asc } from 'drizzle-orm';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domainSlug = url.searchParams.get('domainSlug');
  const includeArchived = (await getUserRole()) === 'admin';

  if (domainSlug) {
    const [domain] = await db
      .select()
      .from(domains)
      .where(
        includeArchived
          ? eq(domains.slug, domainSlug)
          : and(eq(domains.slug, domainSlug), eq(domains.isActive, true)),
      );
    if (!domain) return Response.json({ success: true, situations: [] });

    const list = await db
      .select()
      .from(situations)
      .where(
        includeArchived
          ? eq(situations.domainId, domain.id)
          : and(eq(situations.domainId, domain.id), eq(situations.isActive, true)),
      )
      .orderBy(asc(situations.displayOrder));
    return Response.json({ success: true, situations: list });
  }

  const list = await db
    .select()
    .from(situations)
    .where(includeArchived ? undefined : eq(situations.isActive, true))
    .orderBy(asc(situations.displayOrder));
  return Response.json({ success: true, situations: list });
}
