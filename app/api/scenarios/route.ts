import { db } from '../../../src/db';
import { scenarios } from '../../../src/schema';
import { asc } from 'drizzle-orm';

export async function GET() {
  const list = await db
    .select()
    .from(scenarios)
    .orderBy(asc(scenarios.displayOrder));

  return Response.json({ success: true, scenarios: list });
}
