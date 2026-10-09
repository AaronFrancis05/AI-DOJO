import 'dotenv/config';
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'ai-dojo' });

export type AudioEnqueuedEvent = {
  name: 'audio/enqueued';
  data: {
    jobId: number;
    conversationId: number;
    sessionId: number;
  };
};

/**
 * A role-play session reached `completed`. Sent after the completing write
 * commits (app/api/chat/stream, PATCH /api/sessions/[id]) and consumed by
 * generateStudyPack. The event id is derived from the session, so a second
 * send for the same session is dropped by Inngest's deduplication.
 */
export type SessionCompletedEvent = {
  name: 'session/completed';
  data: {
    sessionId: number;
    userId: string;
  };
};

/**
 * A tutor filed their notes on a 1:1 lesson (PLAN.md 4.2). Consumed by
 * generateStudyPack, which turns the human lesson into homework. The event id
 * is derived from the booking, so re-saving the notes does not build a
 * second pack.
 */
export type TutorLessonNotesFiledEvent = {
  name: 'tutor-lesson/notes-filed';
  data: {
    bookingId: number;
    userId: string;
  };
};
