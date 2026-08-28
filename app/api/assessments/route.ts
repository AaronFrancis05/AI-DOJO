import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { assessmentQueue, assessmentSessions, tutors, units, users } from '@/src/schema';
import { getAuthUser, requireRole, roleErrorResponse } from '@/lib/auth/server';
import { generateCallId } from '@/lib/tutors/rooms';
import { CLASS_DURATIONS_MINUTES, DEFAULT_CALL_TYPE, TUTORS_ENABLED } from '@/lib/tutors/config';
import {
  DEFAULT_INTERVIEWER_AVATAR_ID,
  isKnownInterviewerAvatarId,
} from '@/lib/interview/persona';
import { tutorLanguageError } from '@/lib/tutors/languages';

export const runtime = 'nodejs';

/**
 * Scheduled assessment rooms.
 *
 * Same filters as /api/classes — `?mine=1`, `?unitId=N`, `?past=1` — because
 * the surfaces that list them (the tutor console, the learner's tutors page,
 * a course unit) ask the same three questions of both.
 */
export async function GET(req: Request) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const mine = url.searchParams.get('mine') === '1';
  const unitIdRaw = url.searchParams.get('unitId');
  const unitId = unitIdRaw != null ? Number(unitIdRaw) : null;
  const includePast = url.searchParams.get('past') === '1';

  const [tutorProfile] = await db
    .select({ id: tutors.id })
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);

  const conditions = [sql`${assessmentSessions.status} <> 'cancelled'`];
  if (unitId != null && Number.isInteger(unitId)) {
    conditions.push(eq(assessmentSessions.unitId, unitId));
  }
  if (!includePast) {
    conditions.push(gte(assessmentSessions.scheduledAt, new Date(Date.now() - 60 * 60 * 1000)));
  }

  const rows = await db
    .select({
      assessment: assessmentSessions,
      tutorName: users.name,
      unitTitle: units.title,
      waitingCount: sql<number>`(
        select count(*)::int from ${assessmentQueue}
        where ${assessmentQueue.assessmentId} = ${assessmentSessions.id}
          and ${assessmentQueue.state} = 'waiting'
      )`,
      myState: sql<string | null>`(
        select ${assessmentQueue.state} from ${assessmentQueue}
        where ${assessmentQueue.assessmentId} = ${assessmentSessions.id}
          and ${assessmentQueue.learnerId} = ${user.id}
        limit 1
      )`,
      myPosition: sql<number | null>`(
        select ${assessmentQueue.position} from ${assessmentQueue}
        where ${assessmentQueue.assessmentId} = ${assessmentSessions.id}
          and ${assessmentQueue.learnerId} = ${user.id}
        limit 1
      )`,
    })
    .from(assessmentSessions)
    .innerJoin(tutors, eq(assessmentSessions.tutorId, tutors.id))
    .innerJoin(users, eq(tutors.userId, users.id))
    .leftJoin(units, eq(assessmentSessions.unitId, units.id))
    .where(and(...conditions))
    .orderBy(includePast ? desc(assessmentSessions.scheduledAt) : asc(assessmentSessions.scheduledAt))
    .limit(100);

  const visible = mine
    ? rows.filter(
        (r) => (tutorProfile && r.assessment.tutorId === tutorProfile.id) || r.myState != null,
      )
    : rows;

  return Response.json({
    success: true,
    assessments: visible.map((r) => ({
      id: r.assessment.id,
      title: r.assessment.title,
      description: r.assessment.description,
      tutorId: r.assessment.tutorId,
      tutorName: r.tutorName,
      courseId: r.assessment.courseId,
      unitId: r.assessment.unitId,
      unitTitle: r.unitTitle,
      targetLanguage: r.assessment.targetLanguage,
      instructionLanguage: r.assessment.instructionLanguage,
      scheduledAt: r.assessment.scheduledAt,
      durationMinutes: r.assessment.durationMinutes,
      minutesPerLearner: r.assessment.minutesPerLearner,
      examiner: r.assessment.examiner,
      status: r.assessment.status,
      waitingCount: Number(r.waitingCount),
      myQueueState: r.myState,
      myQueuePosition: r.myPosition == null ? null : Number(r.myPosition),
      isTutor: Boolean(tutorProfile && r.assessment.tutorId === tutorProfile.id),
    })),
  });
}

/** Creates an assessment room. Tutors only. */
export async function POST(req: Request) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [tutorProfile] = await db
    .select()
    .from(tutors)
    .where(eq(tutors.userId, user.id))
    .limit(1);
  if (!tutorProfile) return Response.json({ error: 'No tutor profile' }, { status: 404 });
  if (tutorProfile.verificationStatus !== 'verified') {
    return Response.json(
      { error: 'Your tutor profile is still awaiting verification.' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, 150);
  const description = body.description ? String(body.description).slice(0, 2000) : null;
  const targetLanguage = String(body.targetLanguage ?? '').trim();
  const instructionLanguage = body.instructionLanguage
    ? String(body.instructionLanguage).trim()
    : null;
  const durationMinutes = Number(body.durationMinutes ?? 60);
  const minutesPerLearner = Number(body.minutesPerLearner ?? 10);
  const courseId = body.courseId != null ? Number(body.courseId) : null;
  const unitId = body.unitId != null ? Number(body.unitId) : null;
  const scheduledAt = new Date(String(body.scheduledAt ?? ''));
  const examiner = body.examiner === 'ai' ? 'ai' : 'tutor';
  const rawAvatarId = body.aiInterviewerAvatarId ? String(body.aiInterviewerAvatarId) : '';
  const aiInterviewerBrief = body.aiInterviewerBrief
    ? String(body.aiInterviewerBrief).slice(0, 2000)
    : null;

  if (!title || !targetLanguage) {
    return Response.json({ error: 'title and targetLanguage are required' }, { status: 400 });
  }
  // Same rule as /api/classes, from the same helper — a tutor may only examine
  // in a pair they hold. It also reaches the AI examiner's locked brief.
  const languageError = tutorLanguageError(tutorProfile, targetLanguage, instructionLanguage);
  if (languageError) {
    return Response.json({ error: languageError }, { status: 400 });
  }
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    return Response.json({ error: 'scheduledAt must be a future date' }, { status: 400 });
  }
  if (!(CLASS_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
    return Response.json({ error: 'Unsupported duration' }, { status: 400 });
  }
  if (!Number.isInteger(minutesPerLearner) || minutesPerLearner < 2 || minutesPerLearner > 60) {
    return Response.json(
      { error: 'Minutes per learner must be between 2 and 60' },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(assessmentSessions)
    .values({
      tutorId: tutorProfile.id,
      courseId: courseId != null && Number.isInteger(courseId) ? courseId : null,
      unitId: unitId != null && Number.isInteger(unitId) ? unitId : null,
      title,
      description,
      targetLanguage,
      instructionLanguage,
      scheduledAt,
      durationMinutes,
      minutesPerLearner,
      callId: generateCallId(),
      callType: DEFAULT_CALL_TYPE,
      examiner,
      // Stored even in tutor mode, so switching an assessment to the AI
      // examiner later — the whole point of the feature — needs no second
      // decision at the moment the tutor is already unavailable.
      aiInterviewerAvatarId: isKnownInterviewerAvatarId(rawAvatarId)
        ? rawAvatarId
        : DEFAULT_INTERVIEWER_AVATAR_ID,
      aiInterviewerBrief,
    })
    .returning({ id: assessmentSessions.id });

  return Response.json({ success: true, assessmentId: created?.id ?? null }, { status: 201 });
}
