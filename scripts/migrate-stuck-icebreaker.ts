import { db } from '../src/db';
import { sessions } from '../src/schema';
import { eq, sql, inArray } from 'drizzle-orm';

async function migrateStuckIcebreaker() {
  console.log('🔍 Finding sessions stuck in icebreaker phase with zero vocabulary...');

  const subquery = db
    .select({ id: sql<number>`id` })
    .from(sessions)
    .where(
      sql`phase = 'icebreaker'
        AND scenario_id IN (
          SELECT id FROM scenarios WHERE id NOT IN (
            SELECT DISTINCT scenario_id FROM vocabulary
          )
        )`,
    );

  const stuck = await subquery;
  console.log(`  → Found ${stuck.length} stuck session(s)`);

  if (stuck.length === 0) {
    console.log('✅ No stuck sessions to fix.');
    return;
  }

  const ids = stuck.map(s => s.id);

  await db.update(sessions)
    .set({ phase: 'guided', phaseTurnCount: 0 })
    .where(inArray(sessions.id, ids));

  console.log(`  ✅ Updated ${ids.length} session(s): phase → 'guided', phaseTurnCount → 0`);
}

migrateStuckIcebreaker()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
