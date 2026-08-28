/**
 * Who may listen to what.
 *
 * The pub/sub fan-out has no notion of users, so this is the only place a
 * subscription is checked. It runs once per topic when the SSE connection
 * opens, and a topic that fails is dropped rather than failing the whole
 * connection — one stale room id in a client's topic list should not take
 * down its notifications too.
 *
 * Events are pointers, not content (see topics.ts), so a mistake here leaks
 * the *fact* that something changed, never the thing itself. That is still
 * worth preventing, and it is why every topic here resolves to a real
 * membership check rather than a shape test on the string.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  assessmentQueue,
  assessmentSessions,
  chatRoomMembers,
  classEnrollments,
  classSessions,
  tutors,
} from '@/src/schema';

/** Splits `chat:12` into `['chat', '12']`, tolerating ids that contain ':'. */
function splitTopic(topic: string): [string, string] | null {
  const idx = topic.indexOf(':');
  if (idx <= 0 || idx === topic.length - 1) return null;
  return [topic.slice(0, idx), topic.slice(idx + 1)];
}

async function isTutorOf(tutorId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: tutors.userId })
    .from(tutors)
    .where(eq(tutors.id, tutorId))
    .limit(1);
  return row?.userId === userId;
}

/** Whether `userId` may subscribe to `topic`. */
export async function canSubscribe(topic: string, userId: string): Promise<boolean> {
  const parts = splitTopic(topic);
  if (!parts) return false;
  const [kind, rawId] = parts;

  switch (kind) {
    case 'user':
      // Your own notifications, and nobody else's.
      return rawId === userId;

    case 'chat': {
      const roomId = Number(rawId);
      if (!Number.isInteger(roomId)) return false;
      const [member] = await db
        .select({ id: chatRoomMembers.id })
        .from(chatRoomMembers)
        .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.userId, userId)))
        .limit(1);
      return Boolean(member);
    }

    case 'class': {
      const classId = Number(rawId);
      if (!Number.isInteger(classId)) return false;
      const [row] = await db
        .select({ tutorId: classSessions.tutorId })
        .from(classSessions)
        .where(eq(classSessions.id, classId))
        .limit(1);
      if (!row) return false;
      if (await isTutorOf(row.tutorId, userId)) return true;
      const [enrollment] = await db
        .select({ id: classEnrollments.id })
        .from(classEnrollments)
        .where(and(
          eq(classEnrollments.classSessionId, classId),
          eq(classEnrollments.learnerId, userId),
        ))
        .limit(1);
      return Boolean(enrollment);
    }

    case 'assessment': {
      const assessmentId = Number(rawId);
      if (!Number.isInteger(assessmentId)) return false;
      const [row] = await db
        .select({ tutorId: assessmentSessions.tutorId })
        .from(assessmentSessions)
        .where(eq(assessmentSessions.id, assessmentId))
        .limit(1);
      if (!row) return false;
      if (await isTutorOf(row.tutorId, userId)) return true;
      // A queued learner needs the topic to watch the queue move ahead of
      // them — that IS the waiting-room UI.
      const [slot] = await db
        .select({ id: assessmentQueue.id })
        .from(assessmentQueue)
        .where(and(
          eq(assessmentQueue.assessmentId, assessmentId),
          eq(assessmentQueue.learnerId, userId),
        ))
        .limit(1);
      return Boolean(slot);
    }

    default:
      return false;
  }
}

/** Filters a requested topic list down to the ones this user may have. */
export async function authorizeTopics(
  requested: string[],
  userId: string,
): Promise<string[]> {
  const checks = await Promise.all(
    requested.map(async (topic) => ((await canSubscribe(topic, userId)) ? topic : null)),
  );
  return checks.filter((t): t is string => t !== null);
}
