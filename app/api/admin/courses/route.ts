import { db } from '@/src/db';
import { courses } from '@/src/schema';
import { asc, eq } from 'drizzle-orm';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';

export const runtime = 'nodejs';

/**
 * Every course, active or not — `GET /api/courses` filters to active ones,
 * which is exactly the set the console needs to be able to change.
 */
export async function GET() {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const rows = await db
    .select()
    .from(courses)
    .orderBy(asc(courses.displayOrder), asc(courses.id));

  return Response.json({ success: true, courses: rows });
}

/** Publishes or unpublishes one course. */
export async function PATCH(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  const { courseId, isActive } = (body ?? {}) as { courseId?: unknown; isActive?: unknown };

  if (!Number.isInteger(courseId)) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }
  if (typeof isActive !== 'boolean') {
    return Response.json({ error: 'isActive must be a boolean' }, { status: 400 });
  }

  const [updated] = await db
    .update(courses)
    .set({ isActive })
    .where(eq(courses.id, courseId as number))
    .returning();

  if (!updated) {
    return Response.json({ error: 'Course not found' }, { status: 404 });
  }

  return Response.json({ success: true, course: updated });
}
