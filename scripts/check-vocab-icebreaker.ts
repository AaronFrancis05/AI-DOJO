/**
 * Regression check: verify that every scenario has vocabulary and that
 * icebreaker phase transitions work correctly.
 *
 * Usage: npx tsx scripts/check-vocab-icebreaker.ts [--fix]
 *
 * --fix  Flag to auto-repair sessions stuck in icebreaker with zero vocab.
 */

import { db } from '../src/db';
import { scenarios, sessions, vocabulary } from '../src/schema';
import { eq, sql, inArray, count } from 'drizzle-orm';

async function main() {
  const args = process.argv.slice(2);
  const doFix = args.includes('--fix');

  console.log('=== Regression Check: Vocabulary & Icebreaker ===\n');

  // 1. Check all scenarios have vocabulary
  const scenarioCount = await db
    .select({ count: count() })
    .from(scenarios)
    .then(r => r[0]?.count ?? 0);

  const zeroVocabScenarios = await db
    .select({ id: scenarios.id, title: scenarios.title })
    .from(scenarios)
    .where(
      sql`${scenarios.id} NOT IN (
        SELECT DISTINCT scenario_id FROM ${vocabulary}
      )`,
    );

  console.log(`Total scenarios: ${scenarioCount}`);
  console.log(`Scenarios with zero vocabulary: ${zeroVocabScenarios.length}`);

  if (zeroVocabScenarios.length > 0) {
    console.log('\n⚠️  Scenarios missing vocabulary:');
    for (const s of zeroVocabScenarios) {
      console.log(`  - ID ${s.id}: "${s.title}"`);
    }
  } else {
    console.log('✅ All scenarios have vocabulary.\n');
  }

  // 2. Check for sessions stuck in icebreaker with zero-vocab scenarios
  const stuckSessions = await db
    .select({
      id: sessions.id,
      scenarioId: sessions.scenarioId,
    })
    .from(sessions)
    .where(
      sql`${sessions.phase} = 'icebreaker'
        AND ${sessions.scenarioId} IN (
          SELECT id FROM ${scenarios} WHERE ${scenarios.id} NOT IN (
            SELECT DISTINCT scenario_id FROM ${vocabulary}
          )
        )`,
    );

  console.log(`Sessions stuck in icebreaker with zero-vocab scenario: ${stuckSessions.length}`);

  if (stuckSessions.length > 0) {
    console.log('\n⚠️  Stuck sessions:');
    for (const s of stuckSessions) {
      console.log(`  - Session ID ${s.id} (scenario ${s.scenarioId})`);
    }

    if (doFix) {
      const ids = stuckSessions.map(s => s.id);
      await db.update(sessions)
        .set({ phase: 'guided', phaseTurnCount: 0 })
        .where(inArray(sessions.id, ids));
      console.log(`\n✅ Fixed ${ids.length} session(s): phase → 'guided', phaseTurnCount → 0`);
    } else {
      console.log('\n💡 Run with --fix to auto-repair stuck sessions.');
    }
  } else {
    console.log('✅ No stuck sessions.\n');
  }

  // 3. Summary
  const pass = zeroVocabScenarios.length === 0 && stuckSessions.length === 0;
  console.log(pass ? '\n✅ All checks passed.' : '\n⚠️  Some checks failed.');
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
