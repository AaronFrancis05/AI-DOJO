import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { tutors, users } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { parseLanguageCodes } from '@/lib/tutors/languages';
import { createNotification } from '@/lib/notifications';
import { getInterviewConfig, MIN_GRADABLE_LEARNER_TURNS } from '@/lib/interview/config';
import { DEFAULT_INTERVIEWER_AVATAR_ID, interviewerPersona } from '@/lib/interview/persona';
import { buildInterviewSystemInstruction } from '@/lib/interview/prompt';
import { mintInterviewToken } from '@/lib/interview/token';
import { gradeInterview } from '@/lib/interview/grade';
import { normalizeTranscript } from '@/lib/interview/transcript';
import { loadInterviewLearnerProfile } from '@/lib/interview/data';
import {
  CEFR_LABELS,
  checkTutorProficiency,
  PLACEMENT_MINUTES,
} from '@/lib/interview/cefr';
import {
  completePlacement,
  failPlacement,
  isPlacementPurpose,
  loadLatestPlacement,
  loadPlacementById,
  nextAttemptAt,
  placementScores,
  placementVerdict,
  startPlacement,
  type PlacementPurpose,
} from '@/lib/interview/placement-data';

export const runtime = 'nodejs';

/**
 * The CEFR interview outside an assessment room (PLAN.md 4.3, 4.6).
 *
 * `purpose=placement`     a learner's placement, and the monthly re-test
 * `purpose=tutor_vetting` a tutor applicant's proficiency check
 *
 * GET   the caller's latest result and when the next attempt opens
 * POST  start — mints a config-locked ephemeral Gemini Live token
 * PATCH finish — takes the transcript, grades it with the CEFR rubric
 *
 * The same examiner, token and grader as /api/assessments/[id]/interview;
 * see lib/interview/config.ts for why the Live socket is the one documented
 * exception to routing AI calls through lib/ai-providers.
 */

const persona = interviewerPersona(DEFAULT_INTERVIEWER_AVATAR_ID);

const TITLES: Record<PlacementPurpose, string> = {
  placement: 'Placement interview',
  tutor_vetting: 'Tutor proficiency interview',
};

const DESCRIPTIONS: Record<PlacementPurpose, string> = {
  placement: 'Find the CEFR level, from A1 to C2, at which this learner can really hold a conversation.',
  tutor_vetting: 'Confirm that this tutor applicant speaks at C1 or above, with no weak dimension.',
};

/** What a vetting interview is conducted in: the applicant's first taught language, English preferred. */
async function vettingLanguage(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ languages: tutors.languages })
    .from(tutors)
    .where(eq(tutors.userId, userId))
    .limit(1);
  if (!row) return null;
  const codes = parseLanguageCodes(row.languages);
  return codes.includes('en') ? 'en' : codes[0] ?? null;
}

async function targetLanguageFor(userId: string, purpose: PlacementPurpose): Promise<string | null> {
  if (purpose === 'tutor_vetting') return vettingLanguage(userId);
  const [row] = await db
    .select({ target: users.preferredTargetLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.target ?? null;
}

function readPurpose(value: unknown): PlacementPurpose | null {
  return isPlacementPurpose(value) ? value : null;
}

export async function GET(req: Request) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const purpose = readPurpose(new URL(req.url).searchParams.get('purpose') ?? 'placement');
  if (!purpose) return Response.json({ error: 'Unknown purpose' }, { status: 400 });

  const latest = await loadLatestPlacement(user.id, purpose);
  const verdict = placementVerdict(latest);
  const opens = nextAttemptAt(latest);

  return Response.json({
    success: true,
    interviewer: persona,
    minutes: PLACEMENT_MINUTES,
    latest: latest
      ? {
          id: latest.id,
          status: latest.status,
          endedAt: latest.endedAt,
          learnerTurns: latest.learnerTurns,
          scores: placementScores(latest),
          cefr: verdict,
          feedback: latest.feedback,
        }
      : null,
    nextAttemptAt: opens,
    vetting: purpose === 'tutor_vetting' ? checkTutorProficiency(verdict) : null,
  });
}

export async function POST(req: Request) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const purpose = readPurpose(body?.purpose ?? 'placement');
  if (!purpose) return Response.json({ error: 'Unknown purpose' }, { status: 400 });

  const targetLanguage = await targetLanguageFor(user.id, purpose);
  if (!targetLanguage) {
    return Response.json(
      { error: purpose === 'tutor_vetting' ? 'Apply as a tutor first.' : 'Choose a language to learn first.' },
      { status: purpose === 'tutor_vetting' ? 403 : 400 },
    );
  }

  const config = getInterviewConfig();
  if (!config) {
    return Response.json({ error: 'The AI examiner is not configured on this server.' }, { status: 503 });
  }

  const learner = await loadInterviewLearnerProfile(user.id);

  const started = await startPlacement({
    userId: user.id,
    purpose,
    targetLanguage,
    nativeLanguage: learner.nativeLanguage,
    model: config.model,
  });
  if (!started.ok) return Response.json({ error: started.reason }, { status: 409 });

  const systemInstruction = buildInterviewSystemInstruction({
    persona,
    purpose,
    assessmentTitle: TITLES[purpose],
    assessmentDescription: DESCRIPTIONS[purpose],
    tutorBrief: null,
    unitTitle: null,
    targetLanguage,
    nativeLanguage: learner.nativeLanguage,
    learnerName: learner.name || user.name,
    // A placement exists because the stated level is not trusted; the
    // examiner is told to start low and climb.
    learnerLevel: purpose === 'tutor_vetting' ? 'advanced' : 'unknown — find it',
    learnerCountry: learner.countryName,
    minutes: PLACEMENT_MINUTES,
  });

  let minted;
  try {
    minted = await mintInterviewToken({
      config,
      systemInstruction,
      voiceName: persona.voiceName,
      minutes: PLACEMENT_MINUTES,
    });
  } catch (err) {
    console.error('[placement] could not mint an ephemeral token:', err instanceof Error ? err.message : String(err));
    return Response.json({ error: 'The AI examiner could not be reached. Try again in a moment.' }, { status: 502 });
  }

  return Response.json({
    success: true,
    interviewId: started.placement.id,
    resumed: started.resumed,
    token: minted.token,
    model: minted.model,
    startsBefore: minted.startsBefore,
    expiresAt: minted.expiresAt,
    minutes: PLACEMENT_MINUTES,
    interviewer: persona,
    targetLanguage,
  });
}

export async function PATCH(req: Request) {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { interviewId?: unknown; transcript?: unknown; abandoned?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = Number(body.interviewId);
  if (!Number.isInteger(id)) return Response.json({ error: 'interviewId is required' }, { status: 400 });

  const placement = await loadPlacementById(id);
  if (!placement || placement.userId !== user.id) {
    return Response.json({ error: 'Interview not found' }, { status: 404 });
  }
  if (placement.status !== 'live') {
    return Response.json({ error: 'That interview has already been submitted.' }, { status: 409 });
  }

  if (body.abandoned === true) {
    await failPlacement(id);
    return Response.json({ success: true, graded: false, abandoned: true });
  }

  const transcript = normalizeTranscript(body.transcript);
  const learner = await loadInterviewLearnerProfile(user.id);
  const purpose = placement.purpose as PlacementPurpose;

  let graded = null;
  if (transcript.learnerTurns >= MIN_GRADABLE_LEARNER_TURNS) {
    try {
      graded = await gradeInterview({
        turns: transcript.turns,
        assessmentTitle: TITLES[purpose],
        unitTitle: null,
        tutorBrief: null,
        targetLanguage: placement.targetLanguage,
        nativeLanguage: placement.nativeLanguage,
        learnerLevel: purpose === 'tutor_vetting' ? 'tutor applicant' : learner.level,
        learnerName: learner.name || user.name,
        examinerName: persona.name,
        truncated: transcript.truncated,
        cefr: true,
      });
    } catch (err) {
      // Kept, ungraded: the transcript is what cannot be recreated.
      console.error('[placement] grading failed:', err instanceof Error ? err.message : String(err));
    }
  }

  await completePlacement({
    placement,
    turns: transcript.turns,
    learnerTurns: transcript.learnerTurns,
    scores: graded?.scores ?? null,
    cefr: graded?.cefr ?? null,
    feedback: graded?.feedback || null,
    summary: graded?.summary || null,
  });

  const level = graded?.cefr?.overall ?? null;
  await createNotification({
    userId: user.id,
    type: 'placement',
    title: level
      ? `Your speaking level: ${level} (${CEFR_LABELS[level]})`
      : 'Your interview was recorded',
    body: level
      ? graded?.feedback?.slice(0, 200) ?? null
      : 'It could not be graded automatically. You can try again.',
    href: purpose === 'tutor_vetting' ? '/tutor/vetting' : '/placement',
  });

  return Response.json({
    success: true,
    graded: graded != null,
    scores: graded?.scores ?? null,
    cefr: graded?.cefr ?? null,
    feedback: graded?.feedback ?? null,
    learnerTurns: transcript.learnerTurns,
    truncated: transcript.truncated,
    vetting: purpose === 'tutor_vetting' ? checkTutorProficiency(graded?.cefr ?? null) : null,
  });
}
