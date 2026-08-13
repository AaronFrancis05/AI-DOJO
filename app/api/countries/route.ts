import { db } from '@/src/db';
import { countries } from '@/src/schema';
import { asc, eq } from 'drizzle-orm';

export async function GET() {
  const list = await db
    .select()
    .from(countries)
    .where(eq(countries.isActive, true))
    .orderBy(asc(countries.displayOrder));

  return Response.json({ success: true, countries: list });
}
