import { db } from '../../../../src/db';
import { characters } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const characterId = Number(id);
  if (isNaN(characterId)) {
    return Response.json({ error: 'Invalid character ID' }, { status: 400 });
  }

  const body = await req.json();
  const { gender } = body;

  if (!gender || !['female', 'male'].includes(gender)) {
    return Response.json({ error: 'gender must be "female" or "male"' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, characterId));

  if (!existing) {
    return Response.json({ error: 'Character not found' }, { status: 404 });
  }

  await db
    .update(characters)
    .set({ gender })
    .where(eq(characters.id, characterId));

  return Response.json({ success: true });
}
