/**
 * Character data access layer.
 * Phase 1: wraps fixtures. Phase 2: calls live API.
 *
 * Re-exports mock data directly for synchronous usage by existing pages.
 * New code should prefer the async functions below.
 */
import { characters as fixtureCharacters, type CharacterFixture } from '@/lib/mock-data/characters';

// Re-export mock data directly for sync usage by existing pages
export { fixtureCharacters as characters };
export type { CharacterFixture };

export async function getCharacters(): Promise<CharacterFixture[]> {
  return fixtureCharacters;
}

export async function getCharacterById(id: number): Promise<CharacterFixture | undefined> {
  return fixtureCharacters.find(c => c.id === id);
}
