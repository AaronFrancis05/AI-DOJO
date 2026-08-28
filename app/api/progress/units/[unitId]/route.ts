import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { courseLevels, studentProgress, units } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';

export const runtime = 'nodejs';

/**
 * Reads the JSON array in `student_progress.acknowledged_unit_ids`.
 *
 * Same text-column-holding-JSON shape as
 * `student_lesson_progress.completed_phases`. Tolerant of anything that isn't
 * a clean array of numbers: this column is a convenience, and a malformed one
 * must not stop a learner from acknowledging the unit in front of them.
 */
function parseAcknowledged(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter(Number.isInteger);
  } catch {
    return [];
  }
}

/**
 * Marks a unit acknowledged — "I'm done with this one".
 *
 * Distinct from "every lesson in the unit is complete", which is derived from
 * `student_lesson_progress` and needs no recording. This is the learner's own
 * sign-off, and it is what opens the unit's live-lesson footer.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const unitId = Number((await params).unitId);
  if (!Number.isInteger(unitId)) {
    return Response.json({ error: 'Invalid unit id' }, { status: 400 });
  }

  let body: { targetLanguage?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const targetLanguage = String(body.targetLanguage ?? '').trim() || 'ja';

  // The unit tells us which course row to write on, so the client never gets
  // to name the course itself.
  const [row] = await db
    .select({ courseId: courseLevels.courseId })
    .from(units)
    .innerJoin(courseLevels, eq(units.levelId, courseLevels.id))
    .where(eq(units.id, unitId))
    .limit(1);
  if (!row) return Response.json({ error: 'Unit not found' }, { status: 404 });

  const [progress] = await db
    .select()
    .from(studentProgress)
    .where(and(
      eq(studentProgress.userId, user.id),
      eq(studentProgress.courseId, row.courseId),
      eq(studentProgress.targetLanguage, targetLanguage),
    ))
    .limit(1);

  if (!progress) {
    return Response.json(
      { error: 'You are not enrolled in this course' },
      { status: 404 },
    );
  }

  const acknowledged = parseAcknowledged(progress.acknowledgedUnitIds);
  if (!acknowledged.includes(unitId)) acknowledged.push(unitId);

  await db
    .update(studentProgress)
    .set({
      acknowledgedUnitIds: JSON.stringify(acknowledged),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(studentProgress.id, progress.id));

  return Response.json({ success: true, acknowledgedUnitIds: acknowledged });
}
