import { db } from '../../../src/db';
import { domains } from '../../../src/schema';
import { asc } from 'drizzle-orm';

export async function GET() {
  const list = await db
    .select()
    .from(domains)
    .orderBy(asc(domains.displayOrder));

  return Response.json({ success: true, domains: list });
}
