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
