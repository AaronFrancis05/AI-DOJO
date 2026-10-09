import { isRecord } from '@/lib/roleplay/api-types';

export class RestartSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestartSessionError';
  }
}

/**
 * Open a fresh session for the same lesson/scenario the learner just finished.
 * The completed row stays in history; this is not a resume of that id.
 */
export async function startFollowUpSession(input: {
  scenarioId: number;
  situationId?: number | null;
  lessonId?: number | null;
  characterId?: number | null;
  targetLanguage: string;
  nativeLanguage: string;
  selectedAvatarId?: string | null;
  behaviorMode?: string | null;
}): Promise<number> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenarioId: input.scenarioId,
      situationId: input.situationId ?? undefined,
      lessonId: input.lessonId ?? undefined,
      characterId: input.characterId ?? undefined,
      targetLanguage: input.targetLanguage,
      nativeLanguage: input.nativeLanguage,
      avatarId: input.selectedAvatarId ?? undefined,
      behaviorMode: input.behaviorMode ?? undefined,
    }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = isRecord(body) && typeof body.error === 'string'
      ? body.error
      : 'Failed to start session — try again.';
    throw new RestartSessionError(message);
  }
  if (!isRecord(body) || !isRecord(body.session) || typeof body.session.id !== 'number') {
    throw new RestartSessionError('Failed to start session — try again.');
  }
  return body.session.id;
}
