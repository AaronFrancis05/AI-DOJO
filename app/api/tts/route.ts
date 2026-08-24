import { NextRequest, NextResponse } from 'next/server';
import { resolveAzureVoice } from '../../../lib/language';
import { getAuthUser } from '@/lib/auth/server';
import { cacheGet, cacheSet, cacheKeys, TTL } from '@/lib/cache';

export const runtime = 'nodejs';

// Guests reach this route through the marketing tryout, so it can't simply
// require auth. Mirrors the allowance in app/api/speech/token/route.ts.
const MAX_GUEST_SYNTHESES_PER_IP_PER_HOUR = 40;

export async function POST(req: NextRequest) {
  try {
    // Synthesis is billed per character, so this route must not be an open
    // relay to the Azure account — it previously accepted any caller.
    const user = await getAuthUser();
    if (!user) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rateLimitKey = cacheKeys.tryoutRateLimit(`tts:${ip}`);
      const currentCount = (await cacheGet<number>(rateLimitKey)) ?? 0;
      if (currentCount >= MAX_GUEST_SYNTHESES_PER_IP_PER_HOUR) {
        return NextResponse.json(
          { error: 'Too many speech requests. Please try again later.' },
          { status: 429 },
        );
      }
      await cacheSet(rateLimitKey, currentCount + 1, TTL.TRYOUT_RATE_LIMIT);
    }

    const body = await req.json();
    const { text, lang, ssml, gender } = body;

    if (!text && !ssml) {
      return NextResponse.json({ error: 'text or ssml is required' }, { status: 400 });
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return NextResponse.json({ error: 'Azure Speech not configured' }, { status: 503 });
    }

    const sdk = await import('microsoft-cognitiveservices-speech-sdk');

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    if (!ssml) {
      speechConfig.speechSynthesisVoiceName = resolveAzureVoice(lang ?? 'en-US', gender ?? 'female');
    }
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    const visemes: Array<{ id: number; offsetMs: number }> = [];

    synthesizer.visemeReceived = (_s: unknown, e: { visemeId: number; audioOffset: number }) => {
      visemes.push({
        id: e.visemeId,
        offsetMs: Math.floor(e.audioOffset / 10000),
      });
    };

    return new Promise<NextResponse>((resolve) => {
      const synthesisHandler = (result: any) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioBase64 = Buffer.from(result.audioData).toString('base64');
          resolve(NextResponse.json({ audio: audioBase64, visemes }));
        } else {
          resolve(
            NextResponse.json(
              { error: `Synthesis failed: ${result.errorDetails}` },
              { status: 500 },
            ),
          );
        }
      };

      const errorHandler = (error: string) => {
        synthesizer.close();
        resolve(NextResponse.json({ error }, { status: 500 }));
      };

      if (ssml) {
        synthesizer.speakSsmlAsync(ssml, synthesisHandler, errorHandler);
      } else {
        synthesizer.speakTextAsync(text, synthesisHandler, errorHandler);
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
