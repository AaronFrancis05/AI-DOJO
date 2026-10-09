/**
 * Server-only helpers for personalized learning: announcing a completed
 * session, and the title a learner reads for a scenario.
 */

import { inngest, type SessionCompletedEvent } from '@/lib/inngest/client';
import { getTargetScenarioLocalization, resolveNativeScenarioLocalization } from '@/lib/localization';
import { STUDY_PACKS_ENABLED } from './config';

/**
 * Announces a completed session so generateStudyPack can build its homework.
 *
 * Call it after the completing write has committed: a job that starts before
 * the commit reads a session that is not completed yet and does nothing.
 * Never throws: the learner's session already succeeded, and a missing study
 * pack must not turn that into an error. A no-op with the feature off.
 */
export async function announceSessionCompleted(data: SessionCompletedEvent['data']): Promise<void> {
  if (!STUDY_PACKS_ENABLED) return;
  try {
    await inngest.send({
      id: `session-completed-${data.sessionId}`,
      name: 'session/completed',
      data,
    });
  } catch (err) {
    console.warn('[study-packs] failed to send session/completed', {
      sessionId: data.sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * A scenario's title as this learner reads it: the target scene's title,
 * explained in their native language when that row exists. The same
 * resolvers the session page uses (lib/localization.ts).
 */
export async function scenarioTitleForLearner(
  scenario: { id: number; title: string },
  targetLanguage: string,
  nativeLanguage: string,
): Promise<string> {
  const [targetLoc, nativeLoc] = await Promise.all([
    getTargetScenarioLocalization(scenario.id, targetLanguage),
    resolveNativeScenarioLocalization(scenario.id, targetLanguage, nativeLanguage),
  ]);
  return nativeLoc?.title ?? targetLoc?.title ?? scenario.title;
}
