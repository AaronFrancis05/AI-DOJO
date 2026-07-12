/**
 * Domain data access layer.
 * Phase 1: wraps fixtures. Phase 2: calls live API.
 *
 * Re-exports mock data directly for synchronous usage by existing pages.
 * New code should prefer the async functions below.
 */
import { domains as fixtureDomains, type DomainFixture } from '@/lib/mock-data/domains';

// Re-export mock data directly for sync usage by existing pages
export { fixtureDomains as domains };
export type { DomainFixture };

export async function getDomains(): Promise<DomainFixture[]> {
  // Phase 1: return fixtures
  return fixtureDomains;
  // Phase 2: return fetch('/api/domains').then(r => r.json())
}

export async function getDomainBySlug(slug: string): Promise<DomainFixture | undefined> {
  return fixtureDomains.find(d => d.slug === slug);
}
