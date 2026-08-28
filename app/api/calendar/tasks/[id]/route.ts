import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { calendarTasks } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';

export const runtime = 'nodejs';

/** Marks a to-do (or a lesson reminder) done or pending again. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.status !== 'pending' && body.status !== 'done') {
    return Response.json({ error: "status must be 'pending' or 'done'" }, { status: 400 });
  }

  const [updated] = await db
    .update(calendarTasks)
    .set({ status: body.status, completedAt: body.status === 'done' ? new Date() : null })
    .where(and(eq(calendarTasks.id, taskId), eq(calendarTasks.userId, user.id)))
    .returning();

  if (!updated) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({ success: true, task: updated });
}

/** Removes a to-do or dismisses a lesson reminder. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  const deleted = await db
    .delete(calendarTasks)
    .where(and(eq(calendarTasks.id, taskId), eq(calendarTasks.userId, user.id)))
    .returning({ id: calendarTasks.id });

  if (deleted.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({ success: true });
}
