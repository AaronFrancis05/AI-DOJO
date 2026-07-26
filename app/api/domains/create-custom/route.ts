import { db } from '../../../../src/db';
import { domains, situations, scenarios, scenarioGoals, vocabulary, sessions, characters, userPreferences } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { getAIProvider } from '../../../../lib/ai-providers';
import { getTargetLangConfig } from '../../../../lib/language';
import { eq, and, count } from 'drizzle-orm';

interface VocabInput {
  targetText: string;
  translation: string;
  romaji?: string;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom';
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const {
    domainName,
    situationTitle,
    context,
    learningGoals,
    vocabulary: vocabItems,
    targetLanguage,
    nativeLanguage,
    characterId,
    skillLevel,
    behaviorMode,
  } = body;

  if (!domainName || !situationTitle || !context || !learningGoals) {
    return Response.json({ error: 'domainName, situationTitle, context, and learningGoals are required' }, { status: 400 });
  }

  const baseSlug = slugify(domainName);

  const numericCharacterId = characterId != null && !isNaN(Number(characterId)) ? Number(characterId) : null;

  let charName = 'AI Assistant';
  let charRole = 'Practice Partner';
  if (numericCharacterId) {
    const [char] = await db.select().from(characters).where(eq(characters.id, numericCharacterId));
    if (char) {
      charName = char.name;
      charRole = char.role;
    }
  }

  const session = await db.transaction(async (tx) => {
    let domainSlug = baseSlug.slice(0, 40);
    const dmnValues = {
      name: domainName,
      description: situationTitle,
      icon: 'Sun',
      heroGradientFrom: '#6366f1',
      heroGradientTo: '#4338ca',
      situationCount: 1,
      displayOrder: 999,
    };

    let domain;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? domainSlug : `${domainSlug.slice(0, 34)}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        const [d] = await tx.insert(domains).values({ ...dmnValues, slug: candidate }).returning();
        domain = d;
        break;
      } catch (err: any) {
        if (err?.code === '23505' && attempt < 4) continue;
        throw err;
      }
    }
    if (!domain) throw new Error('Failed to insert domain after retries');

    const [situation] = await tx.insert(situations).values({
      domainId: domain.id,
      title: situationTitle,
      context,
      skillLevel: skillLevel ?? 'beginner',
      behaviorMode: behaviorMode ?? 'standard',
      learningGoals,
      focusPills: learningGoals,
      displayOrder: 1,
    }).returning();

    const [scenario] = await tx.insert(scenarios).values({
      title: situationTitle,
      context,
      businessType: domainName,
      difficulty: skillLevel ?? 'beginner',
      domain: domain.slug,
      aiCharacterName: charName,
      aiCharacterRole: charRole,
      userCharacterName: 'Learner',
      userCharacterRole: 'Student',
      learningGoals,
      situationId: situation.id,
      displayOrder: 1,
    }).returning();

    const lang = targetLanguage ?? 'ja';
    const langName = getTargetLangConfig(lang).name;

    let vocabRows: Array<{ targetText: string; romaji: string; translation: string; category: string; usageTip: string; formalityLevel: string }> = [];

    if (vocabItems && Array.isArray(vocabItems)) {
      const valid = vocabItems.slice(0, 8).filter((v: VocabInput) => v.targetText && v.translation);
      if (valid.length > 0) {
        vocabRows = valid.map((v: VocabInput) => ({
          targetText: v.targetText,
          romaji: v.romaji ?? '',
          translation: v.translation,
          category: 'custom',
          usageTip: '',
          formalityLevel: 'polite',
        }));
      }
    }

    if (vocabRows.length === 0) {
      try {
        const provider = await getAIProvider();
        const vocabSystemPrompt = `You are a vocabulary generator for a ${langName} language learning app. Generate 5-8 essential vocabulary items for the following custom scenario.

Scenario context: ${context}
Learning goals: ${learningGoals}

Each item must be a single ${langName} word or short phrase directly relevant to the scenario. Return strictly a JSON array of objects matching this schema:
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
        // AI call failed — leave vocabRows empty; the defensive fix in the
        // stream route handles zero-vocab scenarios via icebreakerDoneInner.
      }
    }

    if (vocabRows.length > 0) {
      await tx.insert(vocabulary).values(
        vocabRows.map((v: any) => ({
          scenarioId: scenario.id,
          targetText: v.targetText,
          romaji: v.romaji ?? '',
          translation: v.translation,
          languageCode: lang,
          category: v.category ?? 'custom',
          usageTip: v.usageTip || null,
          formalityLevel: v.formalityLevel ?? 'polite',
        })),
      );
    }

    const goalLines = learningGoals.split('\n').filter((l: string) => l.trim().length > 0);
    if (goalLines.length > 0) {
      await tx.insert(scenarioGoals).values(
        goalLines.map((text: string, i: number) => ({
          scenarioId: scenario.id,
          sequenceOrder: i + 1,
          goalText: text.trim(),
          goalType: 'custom',
        })),
      );
    } else {
      await tx.insert(scenarioGoals).values({
        scenarioId: scenario.id,
        sequenceOrder: 1,
        goalText: learningGoals,
        goalType: 'custom',
      });
    }

    const [result] = await tx
      .select({ count: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), eq(sessions.scenarioId, scenario.id)));

    const sessionNumber = (result?.count ?? 0) + 1;

    let voiceGender = 'female';
    if (numericCharacterId) {
      const [char] = await tx
        .select({ gender: characters.gender })
        .from(characters)
        .where(eq(characters.id, numericCharacterId));
      if (char?.gender && ['female', 'male'].includes(char.gender)) {
        voiceGender = char.gender;
      }
    }

    const [session] = await tx.insert(sessions).values({
      userId: user.id,
      scenarioId: scenario.id,
      situationId: situation.id,
      characterId: numericCharacterId,
      behaviorMode: behaviorMode ?? 'standard',
      targetLanguage: targetLanguage ?? 'ja',
      nativeLanguage: nativeLanguage ?? 'en',
      voiceGender,
      sessionNumber,
      status: 'active',
    }).returning();

    return session;
  });

  return Response.json({ success: true, sessionId: session.id }, { status: 201 });
}
