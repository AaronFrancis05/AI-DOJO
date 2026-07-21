import { db } from '../../../../src/db';
import { domains, situations, scenarios, scenarioGoals, vocabulary, sessions, characters } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq, and, count } from 'drizzle-orm';

interface VocabInput {
  japanese: string;
  english: string;
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

    if (vocabItems && Array.isArray(vocabItems)) {
      const valid: VocabInput[] = vocabItems.slice(0, 5).filter((v: VocabInput) => v.japanese && v.english);
      if (valid.length > 0) {
        await tx.insert(vocabulary).values(
          valid.map((v: VocabInput) => ({
            scenarioId: scenario.id,
            japanese: v.japanese,
            romaji: v.romaji ?? '',
            english: v.english,
            category: 'custom',
            formalityLevel: 'polite',
          })),
        );
      }
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

    const [session] = await tx.insert(sessions).values({
      userId: user.id,
      scenarioId: scenario.id,
      situationId: situation.id,
      characterId: numericCharacterId,
      behaviorMode: behaviorMode ?? 'standard',
      targetLanguage: targetLanguage ?? 'ja',
      nativeLanguage: nativeLanguage ?? 'en',
      sessionNumber,
      status: 'active',
    }).returning();

    return session;
  });

  return Response.json({ success: true, sessionId: session.id }, { status: 201 });
}
