import { db } from '@/src/db';
import { calendarTasks } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';

export const runtime = 'nodejs';

/** Creates a free-form to-do on the caller's own calendar. */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, 160);
  const notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  const dueAt = new Date(String(body.dueAt ?? ''));
  const allDay = body.allDay !== false;

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }
  if (Number.isNaN(dueAt.getTime())) {
    return Response.json({ error: 'dueAt must be a valid date' }, { status: 400 });
  }

  const [task] = await db.insert(calendarTasks).values({
    userId: user.id,
    title,
    notes,
    dueAt,
    allDay,
    kind: 'task',
    status: 'pending',
  }).returning();

  return Response.json({ success: true, task }, { status: 201 });
}
