import { situations as fixtureSituations, type SituationFixture } from '@/lib/mock-data/situations';
import type { DataSource } from './result';

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

export async function getSituationsByDomain(domainSlug: string): Promise<{ data: SituationFixture[]; source: DataSource }> {
  try {
    const res = await fetch(`/api/situations?domainSlug=${domainSlug}`);
    const body = await res.json();
    if (body.success && body.situations.length > 0) {
      return { data: body.situations.map((s: any) => adaptDbSituation(s, domainSlug)), source: 'live' };
    }
  } catch (err) {
    console.error(`[data/situations] fetch for "${domainSlug}" failed, serving fixture fallback`, err);
  }
  return { data: fixtureSituations.filter(s => s.domainSlug === domainSlug), source: 'fixture' };
}

export async function getSituationById(id: number): Promise<{ situation: SituationFixture | undefined; source: DataSource }> {
  try {
    const res = await fetch(`/api/situations/${id}`);
    const body = await res.json();
    if (body.success) {
      return { situation: adaptDbSituation(body.situation), source: 'live' };
    }
  } catch (err) {
    console.error(`[data/situations] getSituationById(${id}) failed`, err);
  }
  return { situation: fixtureSituations.find(s => s.id === id), source: 'fixture' };
}

export async function getAllSituations(): Promise<{ data: SituationFixture[]; source: DataSource }> {
  try {
    const res = await fetch('/api/situations');
    const body = await res.json();
    if (body.success && body.situations.length > 0) {
      return { data: body.situations.map(adaptDbSituation), source: 'live' };
    }
  } catch (err) {
    console.error('[data/situations] getAllSituations failed, serving fixture fallback', err);
  }
  return { data: fixtureSituations, source: 'fixture' };
}
