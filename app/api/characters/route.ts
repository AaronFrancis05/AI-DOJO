import { db } from '../../../src/db';
import { characters, domains } from '../../../src/schema';
import { asc, eq } from 'drizzle-orm';

export async function GET() {
  const list = await db
    .select({
      id: characters.id,
      name: characters.name,
      role: characters.role,
      personality: characters.personality,
      avatarColor: characters.avatarColor,
      avatarIcon: characters.avatarIcon,
      voiceType: characters.voiceType,
      gender: characters.gender,
      avatarModelUrl: characters.avatarModelUrl,
      defaultForDomainId: characters.defaultForDomainId,
      defaultForDomain: domains.slug,
      displayOrder: characters.displayOrder,
    })
    .from(characters)
    .leftJoin(domains, eq(characters.defaultForDomainId, domains.id))
    .orderBy(asc(characters.displayOrder));

  return Response.json({ success: true, characters: list });
}
