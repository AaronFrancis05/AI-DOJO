import { db } from '@/src/db';
import { sessions, vocabulary, vocabularyEncounters } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { nextPhase } from '@/lib/roleplay/phase-engine';
import { eq, sql } from 'drizzle-orm';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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
  if (session.phase !== 'icebreaker') {
    return Response.json({ error: 'Session is not in icebreaker phase' }, { status: 400 });
  }

  const body = await req.json();
  const { vocabularyId, transcript, accuracyScore, attemptNumber } = body;

  if (!vocabularyId || typeof accuracyScore !== 'number') {
    return Response.json({ error: 'vocabularyId and accuracyScore are required' }, { status: 400 });
  }

  const [word] = await db.select().from(vocabulary).where(eq(vocabulary.id, vocabularyId));
  if (!word) {
    return Response.json({ error: 'Vocabulary word not found' }, { status: 404 });
  }

  const currentAttempt = attemptNumber ?? 1;
  const passed = accuracyScore >= 70;

  if (!passed && currentAttempt === 1) {
    return Response.json({
      retry: true,
      feedback: 'Not quite — try again: ' + word.translation,
      vocabId: vocabularyId,
      attemptNumber: 2,
    });
  }

  await db.insert(vocabularyEncounters).values({
    sessionId,
    vocabularyId,
    usedCorrectly: passed,
    attemptNumber: currentAttempt,
    accuracyScore,
    phase: 'icebreaker',
  });

  const newIndex = session.icebreakerIndex + 1;

  const [vocabCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vocabulary)
    .where(eq(vocabulary.scenarioId, session.scenarioId));

  const totalVocab = vocabCount?.count ?? 0;
  const icebreakerDone = newIndex >= totalVocab;

  const newPhase = icebreakerDone ? 'guided' : 'icebreaker';

  await db.update(sessions).set({
    icebreakerIndex: newIndex,
    phase: newPhase,
  }).where(eq(sessions.id, sessionId));

  return Response.json({
    success: true,
    usedCorrectly: passed,
    icebreakerIndex: newIndex,
    phase: newPhase,
    vocabCount: totalVocab,
  });
}