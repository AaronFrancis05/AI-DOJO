import { db } from '../../../../src/db';
import { audioJobs, conversations } from '../../../../src/schema';
import { eq, and, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { resolveAzureVoice } from '../../../../lib/language';

export const runtime = 'nodejs';

/**
 * Worker endpoint: processes pending audio jobs.
 * Called via `after()` from the stream route or via a cron/webhook.
 * Generates Azure TTS audio and stores the result URL.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.AUDIO_WORKER_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const batchSize = 5;
    const pending = await db
      .select()
      .from(audioJobs)
      .where(and(
        eq(audioJobs.status, 'pending'),
        sql`${audioJobs.attempts} < ${audioJobs.maxAttempts}`,
      ))
      .limit(batchSize);

    if (pending.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return NextResponse.json({ error: 'Azure Speech not configured' }, { status: 503 });
    }

    const sdk = await import('microsoft-cognitiveservices-speech-sdk');

    const results: { jobId: number; status: string; error?: string }[] = [];

    for (const job of pending) {
      try {
        await db.update(audioJobs).set({
          attempts: sql`${audioJobs.attempts} + 1`,
        }).where(eq(audioJobs.id, job.id));

        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        speechConfig.speechSynthesisVoiceName = resolveAzureVoice(job.lang, job.voiceGender ?? 'female');
        speechConfig.speechSynthesisOutputFormat =
          sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

        const result = await new Promise<{ audioData: ArrayBuffer; errorDetails?: string }>((resolve, reject) => {
          synthesizer.speakTextAsync(
            job.text,
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

        // Store audio as base64 data URL (no blob storage installed)
        const audioBase64 = Buffer.from(result.audioData).toString('base64');
        const dataUrl = `data:audio/mp3;base64,${audioBase64}`;

        await db.update(audioJobs).set({
          status: 'completed',
          audioUrl: dataUrl,
          processedAt: new Date(),
        }).where(eq(audioJobs.id, job.id));

        // Update the conversation's audio status and URL
        await db.update(conversations).set({
          audioStatus: 'generated',
          audioUrl: dataUrl,
        }).where(eq(conversations.id, job.conversationId));

        results.push({ jobId: job.id, status: 'completed' });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await db.update(audioJobs).set({
          error: errorMsg,
          status: sql`CASE WHEN ${audioJobs.attempts} >= ${audioJobs.maxAttempts} THEN 'failed' ELSE 'pending' END`,
        }).where(eq(audioJobs.id, job.id));

        results.push({ jobId: job.id, status: 'failed', error: errorMsg });
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error('[AUDIO WORKER] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
