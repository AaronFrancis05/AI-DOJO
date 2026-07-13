import { db } from '../src/db';
import { scenarios, situations, domains, characters, scenarioGoals, vocabulary } from '../src/schema';
import { eq, and, like } from 'drizzle-orm';

const DOMAIN_MAP: Record<string, string> = {
  daily_life: 'daily_life',
  healthcare: 'hospital',
  transport: 'travel',
  shopping: 'shopping',
  workplace: 'business',
  social: 'daily_life',
  services: 'services',
};

const BUSINESS_TYPE_DOMAIN_MAP: Record<string, string> = {
  'social': 'daily_life',
  'Social / Language Learning': 'daily_life',
  'Social / Cultural': 'daily_life',
  'Social / Community': 'daily_life',
  'Workplace / Social': 'business',
  'Workplace / Onboarding': 'business',
  'Workplace / Meetings': 'business',
  'Workplace / Networking': 'business',
  'Workplace / Remote': 'business',
  'Employment / Formal': 'business',
  'Finance / Services': 'shopping',
  'Services / Daily Life': 'shopping',
  'Accommodation / Daily Life': 'hotel',
};

function resolveDomainSlug(scenario: typeof scenarios.$inferSelect): string {
  const mapped = DOMAIN_MAP[scenario.domain];
  if (mapped && mapped !== 'services') return mapped;

  const businessKey = Object.keys(BUSINESS_TYPE_DOMAIN_MAP).find(
    (key) => scenario.businessType.startsWith(key)
  );
  if (businessKey) return BUSINESS_TYPE_DOMAIN_MAP[businessKey];

  if (scenario.businessType.toLowerCase().includes('hotel') || scenario.businessType.toLowerCase().includes('accommodation')) {
    return 'hotel';
  }
  if (scenario.businessType.toLowerCase().includes('food') || scenario.businessType.toLowerCase().includes('restaurant')) {
    return 'restaurant';
  }
  if (scenario.businessType.toLowerCase().includes('health') || scenario.businessType.toLowerCase().includes('medical')) {
    return 'hospital';
  }
  if (scenario.businessType.toLowerCase().includes('transport') || scenario.businessType.toLowerCase().includes('train') || scenario.businessType.toLowerCase().includes('navigation')) {
    return 'travel';
  }

  return 'daily_life';
}

async function migrate() {
  console.log('=== Legacy Scenario Migration ===');
  console.log('Reading all legacy scenarios...\n');

  const allScenarios = await db.select().from(scenarios);
  console.log(`Found ${allScenarios.length} scenarios to process.\n`);

  const allDomains = await db.select().from(domains);
  const allCharacters = await db.select().from(characters);
  const allSituations = await db.select().from(situations);

  if (allDomains.length === 0) {
    console.error('ERROR: No domains exist. Run the seed script first.');
    process.exit(1);
  }

  const stats = {
    total: allScenarios.length,
    mapped: 0,
    skipped: 0,
    newSituationsCreated: 0,
    domainCounts: {} as Record<string, number>,
  };

  for (const scenario of allScenarios) {
    if (scenario.situationId) {
      console.log(`  [SKIP] Scenario #${scenario.id} "${scenario.title}" already has situationId=${scenario.situationId}`);
      stats.skipped++;
      continue;
    }

    const domainSlug = resolveDomainSlug(scenario);
    const domain = allDomains.find(d => d.slug === domainSlug);

    if (!domain) {
      console.log(`  [WARN] Scenario #${scenario.id} "${scenario.title}" — no domain found for slug "${domainSlug}", skipping`);
      stats.skipped++;
      continue;
    }

    stats.domainCounts[domainSlug] = (stats.domainCounts[domainSlug] ?? 0) + 1;

    let situation = allSituations.find(
      s =>
        s.domainId === domain.id &&
        (s.title === scenario.title || scenario.title.includes(s.title) || s.title.includes(scenario.title))
    );

    if (!situation) {
      const [newSituation] = await db.insert(situations).values({
        domainId: domain.id,
        title: scenario.title,
        context: scenario.context,
        skillLevel: (scenario.difficulty as 'beginner' | 'intermediate' | 'advanced') ?? 'beginner',
        behaviorMode: 'standard',
        learningGoals: scenario.learningGoals,
        focusPills: scenario.learningGoals.split(',').slice(0, 4).map(s => s.trim()).join('|||'),
        displayOrder: scenario.displayOrder,
      }).returning();

      situation = newSituation;
      allSituations.push(newSituation);
      stats.newSituationsCreated++;
      console.log(`  [NEW SITUATION] Created situation #${newSituation.id} "${newSituation.title}" under domain "${domainSlug}"`);
    } else {
      console.log(`  [MATCH] Scenario #${scenario.id} "${scenario.title}" → situation #${situation.id} "${situation.title}"`);
    }

    let characterId: number | null = null;
    const defaultChar = allCharacters.find(c => c.defaultForDomainId === domain.id);
    if (defaultChar) {
      characterId = defaultChar.id;
    } else {
      const emma = allCharacters.find(c => c.name === 'Emma');
      if (emma) characterId = emma.id;
    }

    await db.update(scenarios)
      .set({
        situationId: situation.id,
        domain: domainSlug,
        ...(characterId ? { aiCharacterName: allCharacters.find(c => c.id === characterId)?.name ?? scenario.aiCharacterName } : {}),
      })
      .where(eq(scenarios.id, scenario.id));

    stats.mapped++;
  }

  console.log('\n=== Migration Summary ===');
  console.log(`  Total scenarios:     ${stats.total}`);
  console.log(`  Mapped:              ${stats.mapped}`);
  console.log(`  Skipped (already mapped): ${stats.skipped}`);
  console.log(`  New situations created:   ${stats.newSituationsCreated}`);
  console.log('\nDomain breakdown:');
  for (const [slug, count] of Object.entries(stats.domainCounts)) {
    console.log(`  ${slug}: ${count} scenarios`);
  }
  console.log('\n=== Migration Complete ===');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
