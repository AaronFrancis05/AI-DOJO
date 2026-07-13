import { characters as fixtureCharacters, type CharacterFixture } from '@/lib/mock-data/characters';

export { fixtureCharacters as characters };
export type { CharacterFixture };

const domainIdToSlug: Record<number, string> = {
  1: 'restaurant',
  2: 'hotel',
  3: 'airport',
  4: 'hospital',
  5: 'shopping',
  6: 'business',
  7: 'travel',
  8: 'daily_life',
};

function adaptDbCharacter(d: any): CharacterFixture {
  return {
    id: d.id,
    name: d.name,
    role: d.role,
    personality: d.personality,
    avatarColor: d.avatarColor,
    avatarIcon: d.avatarIcon,
    voiceType: d.voiceType,
    defaultForDomain: d.defaultForDomainId != null ? domainIdToSlug[d.defaultForDomainId] : undefined,
    displayOrder: d.displayOrder ?? 0,
  };
}

export async function getCharacters(): Promise<CharacterFixture[]> {
  try {
    const res = await fetch('/api/characters');
    const data = await res.json();
    if (data.success && data.characters.length > 0) {
      return data.characters.map(adaptDbCharacter);
    }
  } catch {}
  return fixtureCharacters;
}

export async function getCharacterById(id: number): Promise<CharacterFixture | undefined> {
  const all = await getCharacters();
  return all.find(c => c.id === id);
}
