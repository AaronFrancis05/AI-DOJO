import { db } from '../../../../src/db';
import { domains, situations, scenarios, scenarioGoals, vocabulary, sessions, characters } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth/server';
import { eq, and, count } from 'drizzle-orm';

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

  let slug = slugify(domainName);
  const hit = await db.select({ slug: domains.slug }).from(domains).where(eq(domains.slug, slug)).limit(1);
  if (hit.length > 0) {
    slug = `${slug}_${Math.random().toString(36).slice(2, 6)}`;
  }

  let charName = 'AI Assistant';
  let charRole = 'Practice Partner';
  if (characterId) {
    const [char] = await db.select().from(characters).where(eq(characters.id, Number(characterId)));
    if (char) {
      charName = char.name;
      charRole = char.role;
    }
  }

  const [domain] = await db.insert(domains).values({
    slug,
    name: domainName,
    description: situationTitle,
    icon: 'Sun',
    heroGradientFrom: '#6366f1',
    heroGradientTo: '#4338ca',
    displayOrder: 999,
  }).returning();

  const [situation] = await db.insert(situations).values({
    domainId: domain.id,
    title: situationTitle,
    context,
    skillLevel: skillLevel ?? 'beginner',
    behaviorMode: behaviorMode ?? 'standard',
    learningGoals,
    focusPills: learningGoals,
    displayOrder: 1,
  }).returning();

  const [scenario] = await db.insert(scenarios).values({
    title: situationTitle,
    context,
    businessType: domainName,
    difficulty: skillLevel ?? 'beginner',
    domain: slug,
    aiCharacterName: charName,
    aiCharacterRole: charRole,
    userCharacterName: 'Learner',
    userCharacterRole: 'Student',
    learningGoals,
    situationId: situation.id,
    displayOrder: 1,
  }).returning();

  if (vocabItems && Array.isArray(vocabItems)) {
    const valid = vocabItems.slice(0, 5).filter((v: any) => v.japanese && v.english);
    if (valid.length > 0) {
      await db.insert(vocabulary).values(
        valid.map((v: any) => ({
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
    await db.insert(scenarioGoals).values(
      goalLines.map((text: string, i: number) => ({
        scenarioId: scenario.id,
        sequenceOrder: i + 1,
        goalText: text.trim(),
        goalType: 'custom',
      })),
    );
  } else {
    await db.insert(scenarioGoals).values({
      scenarioId: scenario.id,
      sequenceOrder: 1,
      goalText: learningGoals,
      goalType: 'custom',
    });
  }

  const [result] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), eq(sessions.scenarioId, scenario.id)));

  const sessionNumber = (result?.count ?? 0) + 1;

  const [session] = await db.insert(sessions).values({
    userId: user.id,
    scenarioId: scenario.id,
    situationId: situation.id,
    characterId: characterId ? Number(characterId) : null,
    behaviorMode: behaviorMode ?? 'standard',
    targetLanguage: targetLanguage ?? 'ja',
    nativeLanguage: nativeLanguage ?? 'en',
    sessionNumber,
    status: 'active',
  }).returning();

  return Response.json({ success: true, sessionId: session.id }, { status: 201 });
}
