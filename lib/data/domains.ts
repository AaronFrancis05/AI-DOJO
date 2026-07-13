import { domains as fixtureDomains, type DomainFixture } from '@/lib/mock-data/domains';

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

export async function getDomains(): Promise<DomainFixture[]> {
  try {
    const res = await fetch('/api/domains');
    const data = await res.json();
    if (data.success && data.domains.length > 0) {
      return data.domains.map(adaptDbDomain);
    }
  } catch {}
  return fixtureDomains;
}

export async function getDomainBySlug(slug: string): Promise<DomainFixture | undefined> {
  const all = await getDomains();
  return all.find(d => d.slug === slug);
}
