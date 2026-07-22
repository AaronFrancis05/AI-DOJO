import { db } from '../../../src/db';
import { sessions, scenarios, evaluations, situations, domains, characters, userPreferences } from '../../../src/schema';
import { getAuthUser } from '../../../lib/auth/server';
import { eq, and, count, desc } from 'drizzle-orm';

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const scenarioIdFilter = url.searchParams.get('scenarioId');
  const statusFilter = url.searchParams.get('status');

  const conditions = [eq(sessions.userId, user.id)];
  if (scenarioIdFilter) conditions.push(eq(sessions.scenarioId, Number(scenarioIdFilter)));
  if (statusFilter) conditions.push(eq(sessions.status, statusFilter));

  const rows = await db
    .select({
      session: sessions,
      scenarioTitle: scenarios.title,
    })
    .from(sessions)
    .leftJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.startedAt));

  const list = rows.map(r => ({
    ...r.session,
    scenarioTitle: r.scenarioTitle ?? 'Practice Session',
  }));

  return Response.json({ success: true, sessions: list });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const { situationId, characterId, behaviorMode, scenarioId, targetLanguage, nativeLanguage, voiceGender: reqVoiceGender } = body;

  let resolvedScenarioId = scenarioId ? Number(scenarioId) : null;

  if (!resolvedScenarioId) {
    if (!situationId) {
      return Response.json({ error: 'scenarioId or situationId is required' }, { status: 400 });
    }

    const numericSituationId = Number(situationId);
    if (isNaN(numericSituationId)) {
      return Response.json({ error: 'Invalid situationId' }, { status: 400 });
    }

    const [situation] = await db
      .select()
      .from(situations)
      .where(eq(situations.id, numericSituationId));

    if (!situation) {
      return Response.json({ error: 'Situation not found' }, { status: 404 });
    }

    const resolvedCharacterId = characterId ? Number(characterId) : null;
    const resolvedMode = behaviorMode ?? 'standard';

    const [existingScenario] = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.situationId, numericSituationId))
      .limit(1);

    if (existingScenario) {
      resolvedScenarioId = existingScenario.id;
    } else {
      const [domain] = await db
        .select()
        .from(domains)
        .where(eq(domains.id, situation.domainId));

      let charName = 'Assistant';
      let charRole = 'Assistant';
      if (resolvedCharacterId) {
        const [char] = await db
          .select()
          .from(characters)
          .where(eq(characters.id, resolvedCharacterId));
        if (char) {
          // Guard: reject if the character's default domain doesn't match
          // the situation's domain. This catches the ID-collision bug where
          // fixture character IDs point to wrong real characters.
          if (char.defaultForDomainId != null && char.defaultForDomainId !== situation.domainId) {
            console.warn(
              `[session-create] character ${char.id} (${char.name}) default domain ${char.defaultForDomainId} `
              + `does not match situation ${numericSituationId} domain ${situation.domainId}. Rejecting.`,
            );
            return Response.json({
              error: `Character "${char.name}" is not available for this situation. Please select a different character.`,
            }, { status: 400 });
          }
          charName = char.name;
          charRole = char.role;
        }
      }

      const [newScenario] = await db.insert(scenarios).values({
        title: situation.title,
        context: situation.context,
        businessType: domain?.name ?? 'General',
        difficulty: situation.skillLevel,
        domain: domain?.slug ?? 'daily_life',
        aiCharacterName: charName,
        aiCharacterRole: charRole,
        userCharacterName: 'Learner',
        userCharacterRole: 'Student',
        learningGoals: situation.learningGoals,
        situationId: numericSituationId,
        displayOrder: situation.displayOrder,
      }).returning();

      resolvedScenarioId = newScenario.id;
    }
  }

  const numericScenarioId = resolvedScenarioId;
  if (isNaN(numericScenarioId)) {
    return Response.json({ error: 'Invalid scenarioId' }, { status: 400 });
  }

  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, numericScenarioId));
  if (!scenario) {
    return Response.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const [result] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), eq(sessions.scenarioId, numericScenarioId)));

  const sessionNumber = (result?.count ?? 0) + 1;

  let voiceGender = reqVoiceGender ?? 'female';
  if (!reqVoiceGender) {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id));
    if (prefs?.voiceGender) voiceGender = prefs.voiceGender;
  }

  const [session] = await db.insert(sessions).values({
    userId: user.id,
    scenarioId: numericScenarioId,
    situationId: situationId ? Number(situationId) : scenario.situationId,
    characterId: characterId ? Number(characterId) : null,
    behaviorMode: behaviorMode ?? 'standard',
    targetLanguage: targetLanguage ?? 'ja',
    nativeLanguage: nativeLanguage ?? 'en',
    voiceGender,
    sessionNumber,
    status: 'active',
  }).returning();

  return Response.json({ success: true, session }, { status: 201 });
}
