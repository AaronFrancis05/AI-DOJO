import { characters as fixtureCharacters, type CharacterFixture } from '@/lib/mock-data/characters';
import type { DataSource } from './result';

export { fixtureCharacters as characters };
export type { CharacterFixture };

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
    defaultForDomain: d.defaultForDomain ?? undefined,
    displayOrder: d.displayOrder ?? 0,
  };
}

export async function getCharacters(): Promise<{ data: CharacterFixture[]; source: DataSource }> {
  try {
    const res = await fetch('/api/characters', { credentials: 'include' });
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
