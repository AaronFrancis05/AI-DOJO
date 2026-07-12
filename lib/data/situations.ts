/**
 * Situation data access layer.
 * Phase 1: wraps fixtures. Phase 2: calls live API.
 *
 * Re-exports mock data directly for synchronous usage by existing pages.
 * New code should prefer the async functions below.
 */
import { situations as fixtureSituations, type SituationFixture } from '@/lib/mock-data/situations';

// Re-export mock data directly for sync usage by existing pages
export { fixtureSituations as situations };
export type { SituationFixture };

export async function getSituationsByDomain(domainSlug: string): Promise<SituationFixture[]> {
  return fixtureSituations.filter(s => s.domainSlug === domainSlug);
}

export async function getSituationById(id: number): Promise<SituationFixture | undefined> {
  return fixtureSituations.find(s => s.id === id);
}

export async function getAllSituations(): Promise<SituationFixture[]> {
  return fixtureSituations;
}
