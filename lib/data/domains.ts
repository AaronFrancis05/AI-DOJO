import { domains as fixtureDomains, type DomainFixture } from '@/lib/mock-data/domains';
import type { DataSource } from './result';

export { fixtureDomains as domains };
export type { DomainFixture };

function adaptDbDomain(d: any): DomainFixture {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    description: d.description,
    icon: d.icon,
    heroGradientFrom: d.heroGradientFrom ?? '#2D3BC5',
    heroGradientTo: d.heroGradientTo ?? '#141F6B',
    situationCount: d.situationCount ?? 0,
    displayOrder: d.displayOrder ?? 0,
  };
}

export async function getDomains(): Promise<{ data: DomainFixture[]; source: DataSource }> {
  try {
    const res = await fetch('/api/domains');
    const body = await res.json();
    if (body.success && body.domains.length > 0) {
      return { data: body.domains.map(adaptDbDomain), source: 'live' };
    }
  } catch (err) {
    console.error('[data/domains] fetch failed, serving fixture fallback', err);
  }
  return { data: fixtureDomains, source: 'fixture' };
}

export async function getDomainBySlug(slug: string): Promise<{ domain: DomainFixture | undefined; source: DataSource }> {
  const { data, source } = await getDomains();
  return { domain: data.find(d => d.slug === slug), source };
}
