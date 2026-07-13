import { db } from '../../../src/db';
import { characters } from '../../../src/schema';
import { asc } from 'drizzle-orm';

export async function GET() {
  const list = await db
    .select()
    .from(characters)
    .orderBy(asc(characters.displayOrder));

  return Response.json({ success: true, characters: list });
}
