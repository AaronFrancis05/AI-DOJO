import { serve } from 'inngest/next';
import { inngest } from '../../../lib/inngest/client';
import { processAudio } from '../../../lib/inngest/functions/processAudio';
import { reconcileAuthUsers } from '../../../lib/inngest/functions/reconcileAuthUsers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processAudio, reconcileAuthUsers],
});
