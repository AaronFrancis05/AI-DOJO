import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL ?? 'whisper-large-v3-turbo';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY is missing from environment variables' }, { status: 500 });
  }

  const formData = await req.formData();
  const audioFile = formData.get('audio');

  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json({ error: 'Missing "audio" field (expected a file/blob)' }, { status: 400 });
  }

  const language = formData.get('language'); // optional ISO-639-1 hint, e.g. "ja" or "en"

  try {
    const client = new Groq({ apiKey });

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: GROQ_STT_MODEL,
      ...(typeof language === 'string' && language ? { language } : {}),
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err) {
    console.error('[avatar-stt] Groq transcription failed:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
  }
}