import { getAuthUser } from '@/lib/auth/server';
import { db } from '@/src/db';
import { calendarTasks, scenarios, sessions, studyPackItems, studyPacks } from '@/src/schema';
import { and, asc, eq } from 'drizzle-orm';
import { STUDY_PACKS_ENABLED } from '@/lib/study-packs/config';
import { scenarioTitleForLearner } from '@/lib/study-packs/server';

type RouteContext = { params: Promise<{ id: string }> };

async function loadOwnedPack(rawId: string, userId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [pack] = await db
    .select()
    .from(studyPacks)
    .where(and(eq(studyPacks.id, id), eq(studyPacks.userId, userId)))
    .limit(1);
  return pack ?? null;
}

/** One study pack with its items. Opening it the first time marks it opened. */
export async function GET(_req: Request, { params }: RouteContext) {
  if (!STUDY_PACKS_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const pack = await loadOwnedPack((await params).id, user.id);
  if (!pack) return Response.json({ error: 'Study pack not found' }, { status: 404 });

  const [items, [source], [recommended]] = await Promise.all([
    db
      .select({ id: studyPackItems.id, kind: studyPackItems.kind, payload: studyPackItems.payload })
      .from(studyPackItems)
      .where(eq(studyPackItems.packId, pack.id))
      .orderBy(asc(studyPackItems.sequenceOrder)),
    // A lesson pack (PLAN.md 4.2) has no session, so no scenario to name it by.
    pack.sessionId !== null
      ? db
        .select({ id: scenarios.id, title: scenarios.title })
        .from(sessions)
        .innerJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
        .where(eq(sessions.id, pack.sessionId))
        .limit(1)
      : Promise.resolve([]),
    pack.recommendedScenarioId
      ? db
        .select({ id: scenarios.id, title: scenarios.title, difficulty: scenarios.difficulty })
        .from(scenarios)
        .where(eq(scenarios.id, pack.recommendedScenarioId))
        .limit(1)
      : Promise.resolve([]),
  ]);

  if (pack.status === 'ready') {
    await db
      .update(studyPacks)
      .set({ status: 'opened', openedAt: new Date() })
      .where(eq(studyPacks.id, pack.id));
  }

  const titleFor = (s: { id: number; title: string }) =>
    scenarioTitleForLearner(s, pack.targetLanguage, pack.nativeLanguage);

  return Response.json({
    success: true,
    pack: {
      id: pack.id,
      sessionId: pack.sessionId,
      bookingId: pack.bookingId,
      targetLanguage: pack.targetLanguage,
      nativeLanguage: pack.nativeLanguage,
      explanation: pack.explanation,
      status: pack.status === 'ready' ? 'opened' : pack.status,
      createdAt: pack.createdAt,
      scenarioTitle: source ? await titleFor(source) : pack.bookingId !== null ? 'Your lesson with your tutor' : null,
      recommendation: recommended
        ? {
          scenarioId: recommended.id,
          title: await titleFor(recommended),
          difficulty: recommended.difficulty,
          reason: pack.recommendationReason,
        }
        : null,
    },
    items: items.flatMap((item) => {
      try {
        return [{ id: item.id, kind: item.kind, payload: JSON.parse(item.payload) as unknown }];
      } catch {
        return [];
      }
    }),
  });
}

/** `{ status: 'completed' }` marks the homework done, and its calendar reminder with it. */
export async function PATCH(req: Request, { params }: RouteContext) {
  if (!STUDY_PACKS_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.status !== 'completed') {
    return Response.json({ error: "status must be 'completed'" }, { status: 400 });
  }

  const pack = await loadOwnedPack((await params).id, user.id);
  if (!pack) return Response.json({ error: 'Study pack not found' }, { status: 404 });
  if (pack.status === 'completed') return Response.json({ success: true });

  const now = new Date();
  await db
    .update(studyPacks)
    .set({ status: 'completed', completedAt: now, openedAt: pack.openedAt ?? now })
    .where(eq(studyPacks.id, pack.id));
  await db
    .update(calendarTasks)
    .set({ status: 'done', completedAt: now })
    .where(and(eq(calendarTasks.userId, user.id), eq(calendarTasks.sourceStudyPackId, pack.id)));

  return Response.json({ success: true });
}
