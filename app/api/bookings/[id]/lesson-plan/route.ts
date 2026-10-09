import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/src/db';
import { learnerWeakPoints, lessonPlans, tutorBookings, users } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { loadBookingForUser } from '@/lib/tutors/bookings';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { hybridEnabledForLearner, hybridUnavailableResponse } from '@/lib/tutors/hybrid';
import { getAIProvider } from '@/lib/ai-providers';
import { usageRecorder } from '@/lib/ai-usage';
import { getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { loadLanguageCatalog } from '@/lib/language-registry';
import { isCefrLevel } from '@/lib/interview/cefr';
import { fixShareFor, lessonTimings } from '@/lib/courses/syllabus';
import { loadLessonPhases, nextSyllabusStep } from '@/lib/courses/syllabus-data';
import {
  buildLessonPlanPrompt,
  LESSON_PLAN_MAX_TOKENS,
  normalizeEditedPlan,
  parseLessonPlan,
  parseStoredPlan,
  type LessonPlan,
} from '@/lib/tutors/lesson-plan';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';

export const runtime = 'nodejs';

const FIX_WEAK_POINTS = 3;

async function resolve(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) ? id : null;
}

async function loadPlanRow(bookingId: number) {
  const [row] = await db.select().from(lessonPlans).where(eq(lessonPlans.bookingId, bookingId)).limit(1);
  return row ?? null;
}

/**
 * The lesson plan for a 1:1 booking (PLAN.md 4.7) and its slides (4.8 part 3).
 *
 * The tutor gets the whole plan. The learner gets only the slides and which
 * one is showing — the panel beside the video — never the tutor's notes on
 * how to teach them.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = await resolve(params);
  if (bookingId == null) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });
  if (!(await hybridEnabledForLearner(found.booking.learnerId))) return hybridUnavailableResponse();

  const row = await loadPlanRow(bookingId);
  const plan = row ? parseStoredPlan(row.plan) : null;

  if (!found.isTutor) {
    return Response.json({
      success: true,
      isTutor: false,
      slides: plan?.slides ?? [],
      currentSlide: row?.currentSlide ?? 0,
      unitTitle: plan?.unit?.title ?? null,
    });
  }

  return Response.json({
    success: true,
    isTutor: true,
    plan,
    tutorEdited: row?.tutorEdited ?? false,
    currentSlide: row?.currentSlide ?? 0,
  });
}

/**
 * Drafts (or redrafts) the plan from the learner's next syllabus step, their
 * top weak points and CEFR level. A redraft replaces a tutor-edited plan only
 * when asked with `{ replace: true }`, so a stray click cannot erase edits.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = await resolve(params);
  if (bookingId == null) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });
  if (!found.isTutor) return Response.json({ error: 'Only the tutor can do that' }, { status: 403 });
  const { booking } = found;
  if (booking.status === 'cancelled') return Response.json({ error: 'This booking was cancelled' }, { status: 409 });
  if (!(await hybridEnabledForLearner(booking.learnerId))) return hybridUnavailableResponse();

  const body = await req.json().catch(() => ({}));
  const existing = await loadPlanRow(bookingId);
  if (existing?.tutorEdited && body?.replace !== true) {
    return Response.json(
      { error: 'You have edited this plan. Redrafting would replace your edits.', requiresReplace: true },
      { status: 409 },
    );
  }

  const [learner] = await db
    .select({ nativeLanguage: users.nativeLanguage, cefrLevel: users.cefrLevel })
    .from(users)
    .where(eq(users.id, booking.learnerId))
    .limit(1);
  const cefrLevel = isCefrLevel(learner?.cefrLevel) ? learner.cefrLevel : null;

  const [step, weakPoints, [lastLesson]] = await Promise.all([
    nextSyllabusStep(booking.learnerId, booking.targetLanguage, cefrLevel),
    db
      .select({ category: learnerWeakPoints.category, pattern: learnerWeakPoints.pattern, example: learnerWeakPoints.example })
      .from(learnerWeakPoints)
      .where(and(
        eq(learnerWeakPoints.userId, booking.learnerId),
        eq(learnerWeakPoints.targetLanguage, booking.targetLanguage),
        isNull(learnerWeakPoints.resolvedAt),
      ))
      .orderBy(desc(learnerWeakPoints.count), desc(learnerWeakPoints.lastSeenAt))
      .limit(FIX_WEAK_POINTS),
    db
      .select({ notes: tutorBookings.lessonNotes })
      .from(tutorBookings)
      .where(and(
        eq(tutorBookings.tutorId, booking.tutorId),
        eq(tutorBookings.learnerId, booking.learnerId),
        eq(tutorBookings.status, 'completed'),
        ne(tutorBookings.id, bookingId),
      ))
      .orderBy(desc(tutorBookings.scheduledAt))
      .limit(1),
  ]);

  const syllabusPhases = step?.lesson ? await loadLessonPhases(step.lesson.id) : [];
  const fixShare = fixShareFor(cefrLevel);
  const timings = lessonTimings(booking.durationMinutes, fixShare);
  const unit: LessonPlan['unit'] = step ? { id: step.unit.id, title: step.unit.title, cefrLevel: step.level } : null;

  await loadLanguageCatalog();
  const prompt = buildLessonPlanPrompt({
    targetLanguageName: getTargetLangConfig(booking.targetLanguage).name,
    // The tutor reads the plan in the lesson's instruction language; with none
    // chosen, in the language being taught.
    instructionLanguageName: booking.instructionLanguage
      ? getNativeLangName(booking.instructionLanguage)
      : getTargetLangConfig(booking.targetLanguage).name,
    learnerNativeLanguageName: getNativeLangName(learner?.nativeLanguage ?? 'en'),
    cefrLevel,
    durationMinutes: booking.durationMinutes,
    timings,
    unit: step ? { title: step.unit.title, description: step.unit.description, canDo: step.unit.canDo.map((c) => c.text) } : null,
    // The fix_slot / wrap_up rows are template phases, not syllabus content.
    syllabusPhases: syllabusPhases.filter((p) => p.phaseKey !== 'fix_slot' && p.phaseKey !== 'wrap_up'),
    weakPoints,
    lastLessonNotes: lastLesson?.notes ?? null,
    learnerNote: booking.learnerNote,
  });

  const usage = usageRecorder(booking.learnerId, 'lesson-plan');
  let plan: LessonPlan;
  try {
    const provider = await getAIProvider();
    const raw = await provider.generateJSON(prompt, [], {
      modelTier: 'batch',
      maxTokens: LESSON_PLAN_MAX_TOKENS,
      onUsage: usage.onUsage,
    });
    plan = parseLessonPlan(raw, { timings, unit, fixShare, weakPatterns: weakPoints.map((w) => w.pattern) });
  } catch (err) {
    console.error('[lesson-plan] draft failed:', err instanceof Error ? err.message : String(err));
    return Response.json({ error: 'The plan could not be drafted. Try again in a moment.' }, { status: 502 });
  }

  const now = new Date();
  await db
    .insert(lessonPlans)
    .values({
      bookingId,
      unitId: unit?.id ?? null,
      lessonId: step?.lesson?.id ?? null,
      plan: JSON.stringify(plan),
    })
    .onConflictDoUpdate({
      target: lessonPlans.bookingId,
      set: {
        unitId: unit?.id ?? null,
        lessonId: step?.lesson?.id ?? null,
        plan: JSON.stringify(plan),
        tutorEdited: false,
        currentSlide: 0,
        updatedAt: now,
      },
    });
  await db
    .update(tutorBookings)
    .set({ unitId: unit?.id ?? null, lessonId: step?.lesson?.id ?? null, updatedAt: now })
    .where(eq(tutorBookings.id, bookingId));

  await publish(topics.booking(bookingId), { type: 'booking.plan', bookingId });
  return Response.json({ success: true, plan, tutorEdited: false, currentSlide: 0 });
}

/**
 * The tutor edits the plan (`{ plan }`) or moves the panel (`{ currentSlide }`).
 * Either change is pushed to the learner's panel over lib/realtime as a
 * pointer; the learner re-fetches their slides through GET.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = await resolve(params);
  if (bookingId == null) return Response.json({ error: 'Invalid booking id' }, { status: 400 });

  const found = await loadBookingForUser(bookingId, user.id);
  if (!found) return Response.json({ error: 'Booking not found' }, { status: 404 });
  if (!found.isTutor) return Response.json({ error: 'Only the tutor can do that' }, { status: 403 });

  const row = await loadPlanRow(bookingId);
  const current = row ? parseStoredPlan(row.plan) : null;
  if (!row || !current) return Response.json({ error: 'Draft a plan first' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const set: Partial<typeof lessonPlans.$inferInsert> = { updatedAt: new Date() };

  if (body?.plan !== undefined) {
    const edited = normalizeEditedPlan(body.plan, current);
    if (!edited) return Response.json({ error: 'Invalid plan' }, { status: 400 });
    set.plan = JSON.stringify(edited);
    set.tutorEdited = true;
    set.currentSlide = Math.min(row.currentSlide, Math.max(0, edited.slides.length - 1));
  }
  if (body?.currentSlide !== undefined) {
    const slide = Number(body.currentSlide);
    const count = (set.plan ? (JSON.parse(set.plan) as LessonPlan) : current).slides.length;
    if (!Number.isInteger(slide) || slide < 0 || slide >= Math.max(1, count)) {
      return Response.json({ error: 'No such slide' }, { status: 400 });
    }
    set.currentSlide = slide;
    // The first time the panel moves is when the plan is being taught.
    if (!row.taughtAt) set.taughtAt = new Date();
  }

  await db.update(lessonPlans).set(set).where(eq(lessonPlans.id, row.id));
  await publish(topics.booking(bookingId), { type: 'booking.plan', bookingId });

  return Response.json({
    success: true,
    plan: set.plan ? JSON.parse(set.plan) : current,
    currentSlide: set.currentSlide ?? row.currentSlide,
  });
}
