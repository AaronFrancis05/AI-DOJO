import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { hybridEnabledForLearner, hybridUnavailableResponse } from '@/lib/tutors/hybrid';
import { captionSecondsToday, recordCaptionSeconds } from '@/lib/ai-usage';
import { isCefrLevel } from '@/lib/interview/cefr';
import { getTargetLangConfig } from '@/lib/language';
import {
  dailyCaptionMinutes,
  defaultCaptionMode,
  MAX_CAPTION_REPORT_SECONDS,
} from '@/lib/tutors/captions';

export const runtime = 'nodejs';

async function load(params: Promise<{ id: string }>) {
  const user = await getAuthUser();
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };

  const bookingId = Number((await params).id);
  if (!Number.isInteger(bookingId)) return { error: Response.json({ error: 'Invalid booking id' }, { status: 400 }) };

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return { error: Response.json({ error: 'Booking not found' }, { status: 404 }) };
  if (!found.isLearner) return { error: Response.json({ error: 'Captions are for the learner' }, { status: 403 }) };
  if (!(await hybridEnabledForLearner(user.id))) return { error: hybridUnavailableResponse() };
  return { user, found };
}

/**
 * The learner's caption settings for this lesson (PLAN.md 4.8 part 4): the
 * default mode for their level, the languages, and how many caption seconds
 * remain today. The Azure token itself comes from /api/speech/token, the route
 * the roleplay already uses.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const ctx = await load(params);
  if ('error' in ctx) return ctx.error;

  const [learner] = await db
    .select({ nativeLanguage: users.nativeLanguage, cefrLevel: users.cefrLevel })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .limit(1);
  const level = isCefrLevel(learner?.cefrLevel) ? learner.cefrLevel : null;
  const used = await captionSecondsToday(ctx.user.id);

  return Response.json({
    success: true,
    defaultMode: defaultCaptionMode(level),
    // The tutor speaks the language being taught.
    speechLanguage: getTargetLangConfig(ctx.found.booking.targetLanguage).bcp47.stt,
    translateTo: learner?.nativeLanguage ?? 'en',
    remainingSeconds: Math.max(0, dailyCaptionMinutes(level) * 60 - used),
  });
}

/** The browser reports caption time as it runs (`{ seconds }`), for the ledger and the daily cap. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const ctx = await load(params);
  if ('error' in ctx) return ctx.error;

  const body = await req.json().catch(() => null);
  const seconds = Number(body?.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return Response.json({ error: 'seconds must be positive' }, { status: 400 });
  }

  await recordCaptionSeconds(ctx.user.id, Math.min(seconds, MAX_CAPTION_REPORT_SECONDS));

  const [learner] = await db
    .select({ cefrLevel: users.cefrLevel })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .limit(1);
  const level = isCefrLevel(learner?.cefrLevel) ? learner.cefrLevel : null;
  const used = await captionSecondsToday(ctx.user.id);
  return Response.json({ success: true, remainingSeconds: Math.max(0, dailyCaptionMinutes(level) * 60 - used) });
}
