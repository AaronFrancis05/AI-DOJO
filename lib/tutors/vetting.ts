/**
 * A tutor's vetting evidence, read from the database (PLAN.md 4.6). The
 * pass/fail rules are pure, in ./quality-rules.ts and lib/interview/cefr.ts.
 */

import { inArray } from 'drizzle-orm';
import { db } from '@/src/db';
import { cefrPlacements } from '@/src/schema';
import { checkTutorProficiency } from '@/lib/interview/cefr';
import { placementVerdict } from '@/lib/interview/placement-data';
import { parseTrialScores, vettingGaps, type VettingEvidence } from './quality-rules';

export interface TutorVettingRow {
  id: number;
  vettingPlacementId: number | null;
  clarityScore: number | null;
  trialLessonScores: string | null;
  teachingModuleCompletedAt: Date | null;
}

export interface TutorVetting extends VettingEvidence {
  cefrLevel: string | null;
  gaps: string[];
}

/** Evidence and remaining gaps for each tutor row, keyed by tutor id. */
export async function loadVetting(rows: TutorVettingRow[]): Promise<Map<number, TutorVetting>> {
  const placementIds = rows.map((r) => r.vettingPlacementId).filter((id): id is number => id != null);
  const placements = placementIds.length === 0
    ? []
    : await db.select().from(cefrPlacements).where(inArray(cefrPlacements.id, placementIds));
  const byId = new Map(placements.map((p) => [p.id, p]));

  const out = new Map<number, TutorVetting>();
  for (const row of rows) {
    const verdict = placementVerdict(row.vettingPlacementId != null ? byId.get(row.vettingPlacementId) ?? null : null);
    const proficiency = checkTutorProficiency(verdict);
    const evidence: VettingEvidence = {
      proficiencyPassed: proficiency.passed,
      proficiencyReason: proficiency.reason,
      clarityScore: row.clarityScore,
      trialScores: parseTrialScores(row.trialLessonScores),
      teachingModuleCompleted: row.teachingModuleCompletedAt != null,
    };
    out.set(row.id, { ...evidence, cefrLevel: verdict?.overall ?? null, gaps: vettingGaps(evidence) });
  }
  return out;
}
