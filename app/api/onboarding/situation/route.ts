import { NextRequest, NextResponse } from 'next/server';
import { resolvePracticeSituation } from '@/lib/onboarding/practice';
import { sanitizeLanguageCode } from '@/lib/tryout/guest-params';
import { DEFAULT_TARGET_LANGUAGE } from '@/lib/language';

export async function GET(req: NextRequest) {
  const domainId = Number(req.nextUrl.searchParams.get('domainId'));
  const level = req.nextUrl.searchParams.get('level') || 'beginner';
  const targetLanguage = sanitizeLanguageCode(req.nextUrl.searchParams.get('targetLanguage')) || DEFAULT_TARGET_LANGUAGE;

  if (!Number.isFinite(domainId) || domainId <= 0) {
    return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
  }

  const resolved = await resolvePracticeSituation(domainId, level, targetLanguage);
  if (!resolved) {
    return NextResponse.json({ error: 'No situation in this domain' }, { status: 404 });
  }

  return NextResponse.json({ success: true, situation: resolved.situation });
}
