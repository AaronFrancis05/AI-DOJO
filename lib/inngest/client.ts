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
