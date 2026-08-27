/**
 * Writing a notification.
 *
 * One row, then one realtime publish on the recipient's own topic. Split in
 * that order deliberately: the row is the record and must be committed
 * before anything announces it, and the publish fails open (see
 * lib/realtime/bus.ts) so a Redis outage delays a bell badge rather than
 * losing the notification.
 */

import { db } from '@/src/db';
import { notifications } from '@/src/schema';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';

export type NotificationType = 'evaluation' | 'booking' | 'class' | 'assessment';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** In-app path the bell links to. */
  href?: string | null;
}

/**
 * Creates a notification and pushes it to any tab the recipient has open.
 *
 * Never throws: a notification is a courtesy on top of an action that has
 * already succeeded (a submitted evaluation, a confirmed booking), and
 * failing that action because the courtesy failed would be backwards.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    const [row] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 160),
        body: input.body ?? null,
        href: input.href ?? null,
      })
      .returning({ id: notifications.id });

    if (!row) return;

    await publish(topics.user(input.userId), {
      type: 'notification',
      notificationId: row.id,
    });
  } catch (err) {
    console.warn(
      '[notifications] failed to create:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Creates the same notification for several recipients. */
export async function createNotifications(
  userIds: string[],
  input: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  await Promise.all(userIds.map((userId) => createNotification({ ...input, userId })));
}
