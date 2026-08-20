import { db } from '@/src/db';
import { sessions, scenarios, situations, scenarioGoals, goalCompletions, vocabulary } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { getAIProvider } from '@/lib/ai-providers';
import { getTargetLangConfig, getNativeLangName } from '@/lib/language';
import { eq, and, asc } from 'drizzle-orm';

const RECAP_GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // If orientation or already completed, no recap is needed
  if (session.phase === 'orientation' || session.status === 'completed') {
    return Response.json({ recapNeeded: false, phase: session.phase });
  }

  const lastActiveTime = session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : 0;
  const gapMs = Date.now() - lastActiveTime;

  let isForced = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.force === true) isForced = true;
  } catch {}

  if (!isForced && gapMs < RECAP_GAP_THRESHOLD_MS) {
    return Response.json({ recapNeeded: false, gapMs, phase: session.phase });
  }

  const [scenario, situation, completedGoalsResult] = await Promise.all([
    db.select().from(scenarios).where(eq(scenarios.id, session.scenarioId)).then(rows => rows[0] ?? null),
    session.situationId
      ? db.select().from(situations).where(eq(situations.id, session.situationId)).then(rows => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({ goalText: scenarioGoals.goalText, goalType: scenarioGoals.goalType })
      .from(goalCompletions)
      .innerJoin(scenarioGoals, eq(goalCompletions.scenarioGoalId, scenarioGoals.id))
      .where(eq(goalCompletions.sessionId, sessionId)),
  ]);

  if (!scenario) {
    return Response.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const targetLanguage = session.targetLanguage ?? 'ja';
  const nativeLanguage = session.nativeLanguage ?? 'en';
  const targetLangName = getTargetLangConfig(targetLanguage).name;
  const nativeLangName = getNativeLangName(nativeLanguage);
  const isSameLanguage = targetLanguage === nativeLanguage;

  const charName = scenario.aiCharacterName;
  const charRole = scenario.aiCharacterRole;
  const scenarioTitle = situation?.title ?? scenario.title;
  const coveredGoalsList = completedGoalsResult.map((g: { goalText: string; goalType: string }) => `- ${g.goalText}`).join('\n') || 'None completed yet';

  const unguidedImmersionReminder = session.phase === 'unguided'
    ? `Also gently remind the learner that this phase is full immersion in ${targetLangName} (no native-language help).`
    : '';

  const prompt = isSameLanguage
    ? `You are ${charName} (${charRole}) in a practice session titled "${scenarioTitle}".
The student was disconnected or away for a while and has just returned.
Current phase: ${session.phase}
Goals covered so far:
${coveredGoalsList}

Write a short, friendly welcome-back recap (2-3 sentences max) in ${targetLangName}:
1. Welcome them back in character.
2. Briefly summarize what has been covered so far by meaning.
3. State which phase you are in and encourage them to continue.
${unguidedImmersionReminder}`
    : `You are ${charName} (${charRole}) in a ${targetLangName} language learning session titled "${scenarioTitle}".
The learner was disconnected or away for a while and has just reconnected.
Current phase: ${session.phase}
Goals covered so far:
${coveredGoalsList}

Write a brief, friendly welcome-back recap in pure ${nativeLangName} (2–3 sentences max):
1. Welcome the learner back in character as ${charName}.
2. Briefly summarize what has been practiced/covered so far by meaning.
3. STRICT NO-REPEAT RULE: Write entirely in ${nativeLangName}. Do NOT state the actual ${targetLangName} words or romaji; explain only their meanings/topics.
4. Mention the current phase (${session.phase}) and invite them to continue.
${unguidedImmersionReminder}`;

  try {
    const provider = await getAIProvider();
    let recapText = '';
    for await (const chunk of provider.generateStream(prompt, [])) {
      recapText += chunk;
    }
    recapText = recapText.trim();

    // Update lastActiveAt to now
    await db.update(sessions).set({ lastActiveAt: new Date() }).where(eq(sessions.id, sessionId));

    return Response.json({
      recapNeeded: true,
      recapText,
      phase: session.phase,
      gapMs,
    });
  } catch (err) {
    console.error('[SESSION RECAP] Failed to generate recap:', err);
    return Response.json({
      recapNeeded: false,
      error: 'Failed to generate recap',
      phase: session.phase,
    });
  }
}