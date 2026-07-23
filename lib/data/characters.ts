import { characters as fixtureCharacters, type CharacterFixture } from '@/lib/mock-data/characters';
import type { DataSource } from './result';

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
    gender: d.gender ?? 'female',
    avatarModelUrl: d.avatarModelUrl ?? undefined,
    defaultForDomain: d.defaultForDomainId != null ? domainIdToSlug[d.defaultForDomainId] : undefined,
    displayOrder: d.displayOrder ?? 0,
  };
}

export async function getCharacters(): Promise<{ data: CharacterFixture[]; source: DataSource }> {
  try {
    const res = await fetch('/api/characters');
    const body = await res.json();
    if (body.success && body.characters.length > 0) {
      return { data: body.characters.map(adaptDbCharacter), source: 'live' };
    }
  } catch (err) {
    console.error('[data/characters] fetch failed, serving fixture fallback', err);
  }
  return { data: fixtureCharacters, source: 'fixture' };
}

export async function getCharacterById(id: number): Promise<CharacterFixture | undefined> {
  const { data } = await getCharacters();
  return data.find(c => c.id === id);
}
