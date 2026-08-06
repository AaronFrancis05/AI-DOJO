import { db } from '@/src/db';
import { scenarios, scenarioSettings } from '@/src/schema';
import { asc, eq } from 'drizzle-orm';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const countryCode = url.searchParams.get('country');

  const list = await db
    .select()
    .from(scenarios)
    .orderBy(asc(scenarios.displayOrder));

  if (!countryCode) {
    return Response.json({ success: true, scenarios: list });
  }

  const settings = await db
    .select()
    .from(scenarioSettings)
    .where(eq(scenarioSettings.countryCode, countryCode));

  const settingsByScenario = new Map(settings.map((s) => [s.scenarioId, s]));

  const scenariosWithSettings = list
    .map((scenario) => {
      const setting = settingsByScenario.get(scenario.id);
      if (setting && !setting.isAvailable) return null;
      return { ...scenario, country: setting ?? null };
    })
    .filter((s) => s !== null)
    .sort((a, b) => {
      const aFeatured = a!.country?.isFeatured ? 1 : 0;
      const bFeatured = b!.country?.isFeatured ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      const aOrder = a!.country?.displayOrder ?? 0;
      const bOrder = b!.country?.displayOrder ?? 0;
      return aOrder - bOrder;
    });

  return Response.json({ success: true, scenarios: scenariosWithSettings });
}
