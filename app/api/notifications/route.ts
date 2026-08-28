import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { notifications } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';

export const runtime = 'nodejs';

/** Nothing on this page needs more than a bell's worth of history. */
const PAGE_SIZE = 30;

/** The signed-in user's notifications, newest first, plus the unread count. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(PAGE_SIZE);

  // Counted rather than derived from `rows`: an unread notification older
  // than the page would otherwise stop showing on the badge.
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  return Response.json({
    success: true,
    unreadCount: Number(unread),
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  });
}

/**
 * Marks notifications read.
 *
 * `{ all: true }` clears everything; `{ ids: [...] }` clears the ones named.
 * Scoped to the caller's own rows in the WHERE clause, so a hand-crafted id
 * list can only ever clear the sender's own badge.
 */
export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const now = new Date();

  if (body.all === true) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return Response.json({ success: true });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(Number.isInteger)
    : [];
  if (ids.length === 0) {
    return Response.json({ error: 'ids or all is required' }, { status: 400 });
  }

  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, user.id), inArray(notifications.id, ids)));

  return Response.json({ success: true });
}
