import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const LANGUAGE_VOICE_MAP: Record<string, string> = {
  'ja-JP': 'ja-JP-NanamiNeural',
  'en-US': 'en-US-JennyNeural',
  'en': 'en-US-JennyNeural',
  'ja': 'ja-JP-NanamiNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'fr': 'fr-FR-DeniseNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'es': 'es-ES-ElviraNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'de': 'de-DE-KatjaNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'zh': 'zh-CN-XiaoxiaoNeural',
  'ko-KR': 'ko-KR-SunHiNeural',
  'ko': 'ko-KR-SunHiNeural',
  'pt-BR': 'pt-BR-FranciscaNeural',
  'pt': 'pt-BR-FranciscaNeural',
  'vi-VN': 'vi-VN-HoaiMyNeural',
  'vi': 'vi-VN-HoaiMyNeural',
  'th-TH': 'th-TH-PremwadeeNeural',
  'th': 'th-TH-PremwadeeNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'hi': 'hi-IN-SwaraNeural',
};

function resolveVoice(lang: string): string {
  return LANGUAGE_VOICE_MAP[lang] ?? LANGUAGE_VOICE_MAP[lang?.split('-')[0]] ?? 'en-US-JennyNeural';
}

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
    const voice = resolveVoice(lang ?? 'en-US');
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
