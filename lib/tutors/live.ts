/**
 * Announcing that a room has opened.
 *
 * One module so a class and an assessment reach the same people the same way.
 * A tutor who starts a room on the spot has no roster to notify — that is the
 * whole point of a drop-in — so the recipients are resolved from the cohort the
 * room is pinned to, through the same `resolveAudience` the announcements
 * console and the cohort rooms use. A second membership query here would let
 * "my learners" mean one thing in the console and another in the bell.
 *
 * Fire-and-forget by contract: going live is the tutor's action and it has
 * already succeeded by the time this runs. Nothing in here may throw.
 */

import { createNotifications } from '@/lib/notifications';
import { resolveAudience } from '@/lib/tutors/audience';

export interface LiveAnnouncement {
  kind: 'class' | 'assessment';
  /** `tutors.id`, not the user id — that is what resolveAudience is scoped by. */
  tutorId: number;
  tutorName: string;
  title: string;
  courseId: number | null;
  targetLanguage: string;
  /** Where the bell sends them: /live/class/:id or /live/assessment/:id. */
  href: string;
  /**
   * Learners to notify regardless of the cohort — the enrolled roster of a
   * class that was scheduled ahead. Someone who signed up for this one class
   * may not otherwise be one of this tutor's learners yet, and missing them
   * would be the worst possible omission.
   */
  extraLearnerIds?: string[];
}

export async function announceLive(room: LiveAnnouncement): Promise<void> {
  try {
    // Pinned to a course → that course's cohort, in the language actually being
    // taught. Unpinned → everyone this tutor teaches. `resolveAudience` already
    // intersects the course case with the tutor's own learners and drops
    // suspended accounts, so neither is re-checked here.
    const audience = room.courseId != null
      ? await resolveAudience(room.tutorId, 'course', {
          courseId: room.courseId,
          targetLanguage: room.targetLanguage,
        })
      : await resolveAudience(room.tutorId, 'all_my_learners');

    const recipients = [...new Set([
      ...audience.learnerIds,
      ...(room.extraLearnerIds ?? []),
    ])];

    if (recipients.length === 0) return;

    await createNotifications(recipients, {
      type: room.kind,
      title: `${room.tutorName} is live now`,
      body: room.kind === 'class'
        ? `${room.title} — join while it is running.`
        : `${room.title} — take your place in the queue.`,
      href: room.href,
    });
  } catch (err) {
    // An audience that could not be resolved must not fail the tutor's click.
    console.warn(
      '[tutors] could not announce a live room:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
