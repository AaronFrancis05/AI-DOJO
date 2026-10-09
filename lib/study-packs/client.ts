/**
 * Browser-side calls shared by the study-pack surfaces.
 */

/**
 * Starts a role-play session on a scenario and returns its id. Languages left
 * out fall back to the learner's profile (POST /api/sessions).
 */
export async function startScenarioSession(
  scenarioId: number,
  languages?: { targetLanguage: string; nativeLanguage: string },
): Promise<number> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenarioId, ...languages }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.session?.id) throw new Error(data?.error ?? 'Could not start the session.');
  return data.session.id as number;
}

/** Writes a scenario for the learner (POST /api/scenarios/personalized) and returns its id. */
export async function createPersonalizedScenario(topic: string): Promise<number> {
  const res = await fetch('/api/scenarios/personalized', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: topic.trim() || undefined }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.scenarioId !== 'number') {
    throw new Error(data?.error ?? 'Could not write a scenario right now.');
  }
  return data.scenarioId;
}
