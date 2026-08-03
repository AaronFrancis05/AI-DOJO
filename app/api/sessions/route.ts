import { db } from '../../../src/db';
import { dbPool } from '../../../src/db-pool';
import { sessions, scenarios, evaluations, situations, domains, characters, userPreferences, vocabulary } from '../../../src/schema';
import { getAuthUser } from '../../../lib/auth/server';
import { getAIProvider } from '../../../lib/ai-providers';
import { getTargetLangConfig } from '../../../lib/language';
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
      domainId: situations.domainId,
    })
    .from(sessions)
    .leftJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
    .leftJoin(situations, eq(sessions.situationId, situations.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.startedAt));

  const list = rows.map(r => ({
    ...r.session,
    scenarioTitle: r.scenarioTitle ?? 'Practice Session',
    domainId: r.domainId ?? null,
  }));

  return Response.json({ success: true, sessions: list });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const { situationId, characterId, behaviorMode, scenarioId, targetLanguage, nativeLanguage } = body;

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

      const lang = targetLanguage ?? 'ja';
      const langName = getTargetLangConfig(lang).name;

      let vocabRows: Array<{ targetText: string; romaji: string; translation: string; category: string; usageTip: string; formalityLevel: string }> = [];

      const focusPills = situation.focusPills?.split('|||').map((s: string) => s.trim()).filter(Boolean) ?? [];

      try {
        const provider = await getAIProvider();
        const vocabSystemPrompt = `You are a vocabulary generator for a ${langName} language learning app. Generate 5-8 essential vocabulary items for the following scenario.

Scenario context: ${situation.context}
Learning goals: ${situation.learningGoals}
${focusPills.length > 0 ? `Focus areas: ${focusPills.join(', ')}` : ''}

Each item must be a single ${langName} word or short phrase that is directly relevant to the scenario. Return strictly a JSON array of objects matching this schema:
{
  "targetText": "The ${langName} word or phrase",
  "romaji": "Romaji pronunciation (only for Japanese, else empty string)",
  "translation": "English translation",
  "category": "Category like greeting, ordering, question, polite_phrase, direction, etc.",
  "usageTip": "Brief tip on when/how to use this word (in English)",
  "formalityLevel": "casual, polite, or formal"
}`;
        const raw = await provider.generateJSON(vocabSystemPrompt, []);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          vocabRows = parsed.slice(0, 8).map((v: any) => ({
            targetText: String(v.targetText ?? ''),
            romaji: String(v.romaji ?? ''),
            translation: String(v.translation ?? ''),
            category: String(v.category ?? 'general'),
            usageTip: String(v.usageTip ?? ''),
            formalityLevel: ['casual', 'polite', 'formal'].includes(v.formalityLevel) ? v.formalityLevel : 'polite',
          })).filter((v: any) => v.targetText && v.translation);
        }
      } catch {
        // AI call failed — fall through to fallback below
      }

      if (vocabRows.length === 0 && focusPills.length > 0) {
        vocabRows = focusPills.slice(0, 8).map((pill: string) => ({
          targetText: pill,
          romaji: '',
          translation: pill,
          category: 'general',
          usageTip: '',
          formalityLevel: 'polite',
        }));
      }

      const newScenario = await dbPool.transaction(async (tx) => {
        const [sc] = await tx.insert(scenarios).values({
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

        if (vocabRows.length > 0) {
          await tx.insert(vocabulary).values(
            vocabRows.map(v => ({
              scenarioId: sc.id,
              targetText: v.targetText,
              romaji: v.romaji,
              translation: v.translation,
              languageCode: lang,
              category: v.category,
              usageTip: v.usageTip || null,
              formalityLevel: v.formalityLevel,
            })),
          );
        }

        return sc;
      });

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

  let voiceGender = 'female';
  if (characterId) {
    const [char] = await db
      .select({ gender: characters.gender })
      .from(characters)
      .where(eq(characters.id, Number(characterId)));
    if (char?.gender && ['female', 'male'].includes(char.gender)) {
      voiceGender = char.gender;
    }
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
