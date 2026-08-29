import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { countries, units, users } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { closeAssessmentIfDrained, loadAssessmentForUser } from '@/lib/tutors/rooms-data';
import { canJoinBooking } from '@/lib/tutors/rooms';
import { TUTORS_ENABLED } from '@/lib/tutors/config';
import { publish } from '@/lib/realtime/bus';
import { topics } from '@/lib/realtime/topics';
import { createNotification } from '@/lib/notifications';
import { getInterviewConfig, MIN_GRADABLE_LEARNER_TURNS } from '@/lib/interview/config';
import { interviewerPersona } from '@/lib/interview/persona';
import { buildInterviewSystemInstruction } from '@/lib/interview/prompt';
import { mintInterviewToken } from '@/lib/interview/token';
import { gradeInterview } from '@/lib/interview/grade';
import { normalizeTranscript, parseStoredTranscript } from '@/lib/interview/transcript';
import {
  completeInterview,
  failInterview,
  interviewScores,
  loadInterviewById,
  loadInterviewForLearner,
  loadInterviewsForAssessment,
  startInterview,
} from '@/lib/interview/data';

export const runtime = 'nodejs';

/**
 * The AI examiner, for an assessment whose tutor cannot be there.
 *
 * GET   what the caller may see: a learner's own result, or the tutor's list
 * POST  start — mints a config-locked ephemeral Gemini Live token
 * PATCH finish — takes the transcript, marks it, files the result
 *
 * There is no Stream call here. An AI interview has no second human in the
 * room, so an SFU would add a hop and burn participant-minutes to carry audio
 * between a browser and Google that never needed to pass through it. The
 * media path is browser ↔ Gemini Live, direct.
 */

async function resolve(params: Promise<{ id: string }>) {
  const assessmentId = Number((await params).id);
  return Number.isInteger(assessmentId) ? assessmentId : null;
}

/** Everything both POST and PATCH need after the shared guards pass. */
async function loadContext(assessmentId: number, userId: string) {
  const found = await loadAssessmentForUser(assessmentId, userId);
  if (!found) return { error: Response.json({ error: 'Assessment not found' }, { status: 404 }) };
  if (found.assessment.examiner !== 'ai') {
    return {
      error: Response.json(
        { error: 'This assessment is examined by its tutor, not by the AI examiner.' },
        { status: 409 },
      ),
    };
  }
  return { found };
}

/**
 * The learner facts both the examiner's brief and the marking rubric need.
 *
 * Country resolves through `countries` rather than off the raw code, matching
 * `lib/roleplay/analyze-turn.ts` — the identity guard in the prompt wants a
 * country a model can name, not "UG".
 */
async function loadLearnerProfile(userId: string) {
  const [row] = await db
    .select({
      name: users.name,
      level: users.level,
      nativeLanguage: users.nativeLanguage,
      countryName: countries.name,
    })
    .from(users)
    .leftJoin(countries, eq(users.countryCode, countries.code))
    .where(eq(users.id, userId))
    .limit(1);

  return {
    name: row?.name ?? '',
    level: row?.level ?? 'beginner',
    nativeLanguage: row?.nativeLanguage ?? 'en',
    countryName: row?.countryName ?? null,
  };
}

async function loadUnitTitle(unitId: number | null): Promise<string | null> {
  if (unitId == null) return null;
  const [row] = await db
    .select({ title: units.title })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);
  return row?.title ?? null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = await resolve(params);
  if (assessmentId == null) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const ctx = await loadContext(assessmentId, user.id);
  if ('error' in ctx) return ctx.error;
  const { found } = ctx;

  const persona = interviewerPersona(found.assessment.aiInterviewerAvatarId);

  // One transcript, on demand. Kept off the list because a roomful of
  // interviews is megabytes of text nobody has asked to read yet, and the
  // tutor opens them one at a time to mark.
  const requestedId = Number(new URL(req.url).searchParams.get('interviewId'));
  if (Number.isInteger(requestedId)) {
    const one = await loadInterviewById(requestedId);
    if (!one || one.assessmentId !== assessmentId) {
      return Response.json({ error: 'Interview not found' }, { status: 404 });
    }
    if (!found.isTutor && one.learnerId !== user.id) {
      return Response.json({ error: 'Interview not found' }, { status: 404 });
    }
    return Response.json({
      success: true,
      interview: {
        id: one.id,
        learnerId: one.learnerId,
        status: one.status,
        startedAt: one.startedAt,
        endedAt: one.endedAt,
        learnerTurns: one.learnerTurns,
        scores: interviewScores(one),
        feedback: one.feedback,
        transcript: parseStoredTranscript(one.transcript),
      },
    });
  }

  // The tutor gets everyone's result; a learner gets only their own. The same
  // split the waiting queue makes, enforced the same way — server-side.
  if (found.isTutor) {
    const interviews = await loadInterviewsForAssessment(assessmentId);
    return Response.json({ success: true, isTutor: true, interviewer: persona, interviews });
  }

  const mine = await loadInterviewForLearner(assessmentId, user.id);

  return Response.json({
    success: true,
    isTutor: false,
    interviewer: persona,
    interviews: [],
    me: mine
      ? {
          id: mine.id,
          status: mine.status,
          startedAt: mine.startedAt,
          endedAt: mine.endedAt,
          learnerTurns: mine.learnerTurns,
          scores: interviewScores(mine),
          feedback: mine.feedback,
          graded: mine.gradedAt != null,
          transcript: parseStoredTranscript(mine.transcript),
        }
      : null,
  });
}

/** Starts the interview and hands back a token the browser connects with. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = await resolve(params);
  if (assessmentId == null) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const ctx = await loadContext(assessmentId, user.id);
  if ('error' in ctx) return ctx.error;
  const { found } = ctx;

  if (found.isTutor) {
    return Response.json(
      { error: 'You set this examination — there is nothing for you to sit.' },
      { status: 400 },
    );
  }

  // The same window that gates a tutor-run room gates this one. An AI
  // examiner is available at any hour, but the examination still has a time.
  const decision = canJoinBooking({
    scheduledAt: found.assessment.scheduledAt,
    durationMinutes: found.assessment.durationMinutes,
    status: found.assessment.status,
  });
  if (!decision.allowed) {
    return Response.json({ error: decision.reason }, { status: 403 });
  }

  const config = getInterviewConfig();
  if (!config) {
    return Response.json(
      { error: 'The AI examiner is not configured on this server.' },
      { status: 503 },
    );
  }

  const started = await startInterview({
    assessmentId,
    learnerId: user.id,
    targetLanguage: found.assessment.targetLanguage,
    model: config.model,
  });
  if (!started.ok) {
    return Response.json({ error: started.reason }, { status: 409 });
  }

  const [learner, unitTitle] = await Promise.all([
    loadLearnerProfile(user.id),
    loadUnitTitle(found.assessment.unitId),
  ]);

  const persona = interviewerPersona(found.assessment.aiInterviewerAvatarId);
  const minutes = found.assessment.minutesPerLearner;

  // The language the examiner explains and debriefs in. The tutor picks it per
  // assessment from the set they can teach in; with none chosen it falls back
  // to the learner's own, which is what this did before the column existed.
  // It is not the language of the examination itself — that stays
  // `targetLanguage`, and the two are deliberately allowed to differ.
  const instructionLanguage =
    found.assessment.instructionLanguage ?? learner.nativeLanguage;

  const systemInstruction = buildInterviewSystemInstruction({
    persona,
    assessmentTitle: found.assessment.title,
    assessmentDescription: found.assessment.description,
    tutorBrief: found.assessment.aiInterviewerBrief,
    unitTitle,
    targetLanguage: found.assessment.targetLanguage,
    nativeLanguage: instructionLanguage,
    learnerName: learner.name || user.name,
    learnerLevel: learner.level,
    learnerCountry: learner.countryName,
    minutes,
  });

  let minted;
  try {
    minted = await mintInterviewToken({
      config,
      systemInstruction,
      voiceName: persona.voiceName,
      minutes,
    });
  } catch (err) {
    console.error(
      '[interview] could not mint an ephemeral token:',
      err instanceof Error ? err.message : String(err),
    );
    // The row stays resumable rather than being burnt by an outage on our side.
    return Response.json(
      { error: 'The AI examiner could not be reached. Try again in a moment.' },
      { status: 502 },
    );
  }

  // The tutor's roster shows a learner move into their interview.
  await publish(topics.assessment(assessmentId), { type: 'assessment.queue', assessmentId });

  return Response.json({
    success: true,
    interviewId: started.interview.id,
    resumed: started.resumed,
    // The token IS access to a Live session, so it is only ever returned here,
    // alongside a passed authorization — never in a listing.
    token: minted.token,
    model: minted.model,
    startsBefore: minted.startsBefore,
    expiresAt: minted.expiresAt,
    minutes,
    interviewer: persona,
    targetLanguage: found.assessment.targetLanguage,
  });
}

/**
 * Finishes the interview: stores the transcript, marks it, notifies both sides.
 *
 * Marking runs inline rather than in the background. It is a once-per-learner
 * action the learner is waiting on the result of, and a half-written row —
 * transcript stored, scores pending, nothing driving them — is a state the
 * tutor's list would have to explain.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const assessmentId = await resolve(params);
  if (assessmentId == null) {
    return Response.json({ error: 'Invalid assessment id' }, { status: 400 });
  }

  const ctx = await loadContext(assessmentId, user.id);
  if ('error' in ctx) return ctx.error;
  const { found } = ctx;

  let body: { interviewId?: unknown; transcript?: unknown; abandoned?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const interviewId = Number(body.interviewId);
  if (!Number.isInteger(interviewId)) {
    return Response.json({ error: 'interviewId is required' }, { status: 400 });
  }

  const interview = await loadInterviewById(interviewId);
  // Scoped to this assessment AND this caller: an interview id is not a
  // capability, so neither half of that check is redundant.
  if (!interview || interview.assessmentId !== assessmentId || interview.learnerId !== user.id) {
    return Response.json({ error: 'Interview not found' }, { status: 404 });
  }
  if (interview.status === 'completed') {
    return Response.json({ error: 'That interview has already been submitted.' }, { status: 409 });
  }

  // The session died before it produced anything worth marking. Left
  // resumable on purpose — a failed microphone should not spend the attempt.
  if (body.abandoned === true) {
    await failInterview(interviewId);
    await publish(topics.assessment(assessmentId), { type: 'assessment.queue', assessmentId });
    return Response.json({ success: true, graded: false, abandoned: true });
  }

  const transcript = normalizeTranscript(body.transcript);

  const [learner, unitTitle] = await Promise.all([
    loadLearnerProfile(user.id),
    loadUnitTitle(found.assessment.unitId),
  ]);

  const persona = interviewerPersona(found.assessment.aiInterviewerAvatarId);

  // Marked and fed back in the same language the examination was explained in,
  // so the debrief matches what the learner heard during it — see the POST
  // handler above, which locks the same choice into the examiner's brief.
  const instructionLanguage =
    found.assessment.instructionLanguage ?? learner.nativeLanguage;

  let scores = null;
  let feedback: string | null = null;
  let summary = '';

  if (transcript.learnerTurns >= MIN_GRADABLE_LEARNER_TURNS) {
    try {
      const graded = await gradeInterview({
        turns: transcript.turns,
        assessmentTitle: found.assessment.title,
        unitTitle,
        tutorBrief: found.assessment.aiInterviewerBrief,
        targetLanguage: found.assessment.targetLanguage,
        nativeLanguage: instructionLanguage,
        learnerLevel: learner.level,
        learnerName: learner.name || user.name,
        examinerName: persona.name,
        truncated: transcript.truncated,
      });
      scores = graded.scores;
      feedback = graded.feedback || null;
      summary = graded.summary;
    } catch (err) {
      // Fail open, and keep the evidence. The transcript is the thing that
      // cannot be recreated; a score can be produced later by the tutor
      // reading it. Losing the interview because the grader was down would be
      // the wrong way round.
      console.error(
        '[interview] grading failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const saved = await completeInterview({
    interviewId,
    turns: transcript.turns,
    learnerTurns: transcript.learnerTurns,
    scores,
    feedback,
    status: 'completed',
  });

  await publish(topics.assessment(assessmentId), { type: 'assessment.queue', assessmentId });

  // The room closes itself. Nobody is examining an AI-run assessment, so there
  // is no tutor present to press "end" — and leaving it 'live' would keep it on
  // every learner's list, and keep late arrivals joining a queue that will
  // never be worked. Only ever an AI room: a tutor ends their own.
  // The drain check and the close are one locked transaction inside
  // `closeAssessmentIfDrained`, taking the same advisory lock `startInterview`
  // takes — otherwise a learner can begin an interview in the gap between the
  // two and end up attached to a room that has just closed. It returns true
  // only for the request that actually closed it.
  let assessmentClosed = false;
  if (found.assessment.examiner === 'ai' && found.assessment.status === 'live') {
    assessmentClosed = await closeAssessmentIfDrained(assessmentId);
    if (assessmentClosed) {
      await publish(topics.assessment(assessmentId), {
        type: 'assessment.status',
        assessmentId,
        status: 'completed',
      });
    }
  }

  await createNotification({
    userId: user.id,
    type: 'assessment',
    title: scores
      ? `${persona.name} marked your interview`
      : 'Your interview was recorded',
    body: scores
      ? feedback?.slice(0, 200) ?? null
      : 'It could not be marked automatically — your tutor will review it.',
    href: `/live/assessment/${assessmentId}`,
  });

  // The tutor set this examination and was not in the room for it; the bell is
  // how they learn it happened — and, on the last one, that the room has shut
  // itself. Told once, in one notification, rather than as a second bell that
  // says nothing the first did not.
  await createNotification({
    userId: found.tutorUserId,
    type: 'assessment',
    title: assessmentClosed
      ? `Everyone has been assessed in ${found.assessment.title}`
      : `${learner.name || user.name} finished ${found.assessment.title}`,
    body: assessmentClosed
      ? `${learner.name || user.name} was the last in the queue, so the room has closed.`
      : summary || null,
    href: `/live/assessment/${assessmentId}`,
  });

  return Response.json({
    success: true,
    graded: scores != null,
    scores,
    feedback,
    learnerTurns: transcript.learnerTurns,
    truncated: transcript.truncated,
    status: saved?.status ?? 'completed',
  });
}
