import { situations as fixtureSituations, type SituationFixture } from '@/lib/mock-data/situations';

export { fixtureSituations as situations };
export type { SituationFixture };

function adaptDbSituation(d: any, domainSlug?: string): SituationFixture {
  return {
    id: d.id,
    domainSlug: domainSlug ?? d.domainSlug ?? '',
    title: d.title,
    context: d.context,
    skillLevel: d.skillLevel as any ?? 'beginner',
    behaviorMode: d.behaviorMode as any ?? 'standard',
    learningGoals: d.learningGoals,
    focusPills: (typeof d.focusPills === 'string'
      ? d.focusPills.includes('|||') ? d.focusPills.split('|||') : d.focusPills.split(',')
      : d.focusPills) ?? [],
    displayOrder: d.displayOrder ?? 0,
    counterpartRole: d.counterpartRole ?? '',
  };
}

export async function getSituationsByDomain(domainSlug: string): Promise<SituationFixture[]> {
  try {
    const res = await fetch(`/api/situations?domainSlug=${domainSlug}`);
    const data = await res.json();
    if (data.success && data.situations.length > 0) {
      return data.situations.map((s: any) => adaptDbSituation(s, domainSlug));
    }
  } catch {}
  return fixtureSituations.filter(s => s.domainSlug === domainSlug);
}

export async function getSituationById(id: number): Promise<SituationFixture | undefined> {
  try {
    const res = await fetch(`/api/situations/${id}`);
    const data = await res.json();
    if (data.success) {
      return adaptDbSituation(data.situation);
    }
  } catch {}
  return fixtureSituations.find(s => s.id === id);
}

export async function getAllSituations(): Promise<SituationFixture[]> {
  try {
    const res = await fetch('/api/situations');
    const data = await res.json();
    if (data.success && data.situations.length > 0) {
      return data.situations.map(adaptDbSituation);
    }
  } catch {}
  return fixtureSituations;
}
