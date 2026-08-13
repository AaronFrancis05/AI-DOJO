import { db } from '@/src/db';
import { audioJobs, conversations } from '@/src/schema';
import { eq, and, sql } from 'drizzle-orm';
import { inngest, type AudioEnqueuedEvent } from '@/lib/inngest/client';
import { resolveAzureVoice } from '@/lib/language';

type StepTools = {
  run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
};

/**
 * Durable worker for Azure TTS synthesis.
 * Triggered by `audio/enqueued`. Re-reads the job from `audio_jobs`,
 * claims it, synthesizes, and finalizes status/URLs. Retries are owned
 * by Inngest (mirrors the legacy `max_attempts = 3`).
 */
export const processAudio = inngest.createFunction(
  {
    id: 'process-audio',
    triggers: { event: 'audio/enqueued' },
    retries: 3 as const,
    concurrency: {
      limit: 1,
      key: 'event.data.conversationId',
    },
  },
  async ({ event, step }: { event: { data: AudioEnqueuedEvent['data'] }; step: StepTools }) => {
    const { jobId, conversationId } = event.data;

    const claimed = await step.run('claim-job', async () => {
      const rows = await db
        .update(audioJobs)
        .set({
          status: 'processing',
          attempts: sql`${audioJobs.attempts} + 1`,
        })
        .where(
          and(
            eq(audioJobs.id, jobId),
            sql`${audioJobs.status} IN ('pending', 'processing')`,
          ),
        )
        .returning();

      if (rows.length === 0) {
        return null;
      }
      return {
        text: rows[0].text,
        lang: rows[0].lang,
        voiceGender: rows[0].voiceGender ?? null,
      };
    });

    if (claimed === null) {
      await step.run('already-claimed', async () => {
        console.log('[INNGEST] audio job', jobId, 'already processed or claimed elsewhere');
      });
      return { status: 'skipped' };
    }

    const audioDataUrl = await step.run('synthesize', async () => {
      const speechKey = process.env.AZURE_SPEECH_KEY;
      const speechRegion = process.env.AZURE_SPEECH_REGION;

      if (!speechKey || !speechRegion) {
        throw new Error('Azure Speech not configured');
      }

      const sdk = await import('microsoft-cognitiveservices-speech-sdk');

      const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
      speechConfig.speechSynthesisVoiceName = resolveAzureVoice(claimed.lang, claimed.voiceGender ?? 'female');
      speechConfig.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

      const result = await new Promise<{ audioData: ArrayBuffer; errorDetails?: string }>((resolve, reject) => {
        synthesizer.speakTextAsync(
          claimed.text,
          (result) => {
            synthesizer.close();
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              resolve({ audioData: result.audioData });
            } else {
              resolve({ audioData: new ArrayBuffer(0), errorDetails: result.errorDetails });
            }
          },
          (error: string) => {
            synthesizer.close();
            reject(new Error(error));
          },
        );
      });

      if (result.errorDetails) {
        throw new Error(result.errorDetails);
      }

      return `data:audio/mp3;base64,${Buffer.from(result.audioData).toString('base64')}`;
    });

    await step.run('finalize', async () => {
      const processedAt = new Date();
      await db.update(audioJobs).set({
        status: 'completed',
        audioUrl: audioDataUrl,
        processedAt,
      }).where(eq(audioJobs.id, jobId));

      await db.update(conversations).set({
        audioStatus: 'generated',
        audioUrl: audioDataUrl,
      }).where(eq(conversations.id, conversationId));
    });

    return { status: 'completed', jobId };
  },
);
