/**
 * The default title for a live room pinned to a curriculum unit.
 *
 * Pure and free of the database client on purpose, the same way
 * `lib/auth/roles.ts` is: the tutor console prefills the title field with this
 * as the tutor picks a unit, and importing the Drizzle client into a client
 * component to do it would drag the whole ORM into the browser bundle.
 *
 * A default, never a lock. Tutors name a room for reasons the hierarchy does
 * not know about ("Unit 2 — retake for Thursday's absentees"), so the console
 * stops overwriting the field the moment they type in it.
 */

export interface RoomTitleParts {
  /** `units.sequenceOrder` — 1-based, as stored. */
  unitSequence: number;
  unitTitle: string;
  kind: 'class' | 'assessment';
}

export function composeRoomTitle({ unitSequence, unitTitle, kind }: RoomTitleParts): string {
  const suffix = kind === 'class' ? 'live practice' : 'speaking check';
  // Matches the column: varchar(150) on both class_sessions and
  // assessment_sessions. A long unit title is trimmed here rather than
  // silently truncated by the route.
  return `Unit ${unitSequence} · ${unitTitle} — ${suffix}`.slice(0, 150);
}
