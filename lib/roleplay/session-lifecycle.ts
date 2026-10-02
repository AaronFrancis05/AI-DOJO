/**
 * Roleplay session lifecycle: playable vs ended, and the accumulated clock.
 *
 * `status` is how the attempt ended (or that it has not). Pass/fail of a
 * finished scenario is a score (`passed`), not a status. Quitting early is
 * `abandoned`, distinct from `completed` + a failing score.
 */

export const SESSION_PLAYABLE_STATUSES = ['active', 'paused'] as const;
export const SESSION_ENDED_STATUSES = ['completed', 'abandoned'] as const;

export type SessionPlayableStatus = (typeof SESSION_PLAYABLE_STATUSES)[number];
export type SessionEndedStatus = (typeof SESSION_ENDED_STATUSES)[number];

export function isSessionPlayable(status: string | null | undefined): boolean {
  return status === 'active' || status === 'paused';
}

export function isSessionEnded(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'abandoned';
}

export const ABANDONMENT_REASONS = [
  { id: 'too_difficult', label: 'Too difficult' },
  { id: 'out_of_time', label: 'Ran out of time' },
  { id: 'technical_issue', label: 'Technical problem' },
  { id: 'not_a_fit', label: "Scenario wasn't a fit" },
  { id: 'other', label: 'Other' },
] as const;

export type AbandonmentReasonId = (typeof ABANDONMENT_REASONS)[number]['id'];

export function isAbandonmentReason(value: unknown): value is AbandonmentReasonId {
  return typeof value === 'string' && ABANDONMENT_REASONS.some((reason) => reason.id === value);
}

export function formatSessionClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

/** Voice and avatar are the two play views of one session; the chooser is not. */
export function isSessionPlayView(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && /\/session\/\d+\/(voice|avatar)\/?$/.test(pathname);
}
