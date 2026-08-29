/**
 * Validating the curriculum unit a live room is pinned to.
 *
 * `class_sessions.unit_id` and `assessment_sessions.unit_id` are what the
 * course page keys its "join the live lesson for this unit" footer on, so a
 * pin that points at a unit from another course does not fail loudly — it
 * fails by never appearing where the tutor expected it. Both create routes
 * used to accept any integer that parsed.
 *
 * Server-only: it reads the database. The console's title prefill uses
 * `lib/curriculum/room-title.ts`, which is pure.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { courseLevels, units } from '@/src/schema';

export type RoomAnchor =
  | { ok: true; courseId: number | null; unitId: number | null }
  | { ok: false; error: string };

/**
 * Resolves the (course, unit) pair a room should store.
 *
 * A unit determines its own course through `course_levels`, so that is treated
 * as the authority: a caller that sends both gets them checked against each
 * other, and one that sends only a unit gets the course filled in rather than
 * a 400 it cannot act on.
 */
export async function resolveRoomAnchor(
  rawCourseId: unknown,
  rawUnitId: unknown,
): Promise<RoomAnchor> {
  const courseId = toId(rawCourseId);
  const unitId = toId(rawUnitId);

  // A standalone conversation hour belongs to no unit. Still allowed.
  if (unitId == null) return { ok: true, courseId, unitId: null };

  const [row] = await db
    .select({ courseId: courseLevels.courseId })
    .from(units)
    .innerJoin(courseLevels, eq(units.levelId, courseLevels.id))
    .where(eq(units.id, unitId))
    .limit(1);

  if (!row) return { ok: false, error: 'That unit does not exist' };
  if (courseId != null && row.courseId !== courseId) {
    return { ok: false, error: 'That unit belongs to a different course' };
  }

  return { ok: true, courseId: row.courseId, unitId };
}

/** `null` for anything that is not a positive integer id, including 0 and ''. */
function toId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
