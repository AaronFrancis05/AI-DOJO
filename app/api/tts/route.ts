import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { text, lang } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return NextResponse.json({ error: 'Azure Speech not configured' }, { status: 503 });
    }

    const sdk = await import('microsoft-cognitiveservices-speech-sdk');

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    const voice = lang?.startsWith('ja') ? 'ja-JP-NanamiNeural' : 'en-US-JennyNeural';
    speechConfig.speechSynthesisVoiceName = voice;
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
      synthesizer.speakTextAsync(
        text,
        (result) => {
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
        },
        (error: string) => {
          synthesizer.close();
          resolve(NextResponse.json({ error }, { status: 500 }));
        },
      );
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
