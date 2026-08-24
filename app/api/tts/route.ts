import { NextRequest, NextResponse } from 'next/server';
import { resolveAzureVoice } from '../../../lib/language';
import { getAuthUser } from '@/lib/auth/server';
import { rateLimitIncrement, cacheKeys, TTL } from '@/lib/cache';

export const runtime = 'nodejs';

// Guests reach this route through the marketing tryout, so it can't simply
// require auth. Mirrors the allowance in app/api/speech/token/route.ts.
const MAX_GUEST_SYNTHESES_PER_IP_PER_HOUR = 40;

// A request count alone doesn't bound the bill — Azure charges per character,
// so one allowed request could carry a megabyte of text. Roughly a paragraph,
// which is more than any tryout line needs.
const MAX_GUEST_CHARS_PER_REQUEST = 1000;

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();

    const body = await req.json();
    const { text, lang, ssml, gender } = body;

    if (!text && !ssml) {
      return NextResponse.json({ error: 'text or ssml is required' }, { status: 400 });
    }

    // Synthesis is billed per character, so this route must not be an open
    // relay to the Azure account — it previously accepted any caller.
    if (!user) {
      const payload = String(ssml ?? text ?? '');
      if (payload.length > MAX_GUEST_CHARS_PER_REQUEST) {
        return NextResponse.json(
          { error: 'That text is too long to synthesize.' },
          { status: 413 },
        );
      }

      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rateLimitKey = cacheKeys.tryoutRateLimit(`tts:${ip}`);
      // Fails closed: with no counter to increment there is no way to bound
      // guest spend, and an unmetered relay is the worse failure mode.
      const count = await rateLimitIncrement(rateLimitKey, TTL.TRYOUT_RATE_LIMIT);
      if (count === null || count > MAX_GUEST_SYNTHESES_PER_IP_PER_HOUR) {
        return NextResponse.json(
          { error: 'Too many speech requests. Please try again later.' },
          { status: 429 },
        );
      }
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
