import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { domains } from '@/src/schema';
import { domains as fixtureDomains } from '@/lib/mock-data/domains';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not defined');
    }

    const sql = neon(process.env.DATABASE_URL);
    const db = drizzle(sql, { schema: { domains } });

    const list = await db
      .select()
      .from(domains)
      .orderBy(asc(domains.displayOrder));

    return Response.json({ success: true, domains: list });
  } catch (error) {
    console.error('[api/domains] failed to load domains, falling back to fixtures', error);
    return Response.json({
      success: true,
      domains: fixtureDomains,
      source: 'fixture',
    });
  }
}
