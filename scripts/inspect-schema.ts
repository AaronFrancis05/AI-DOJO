import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const tables = ['users', 'sessions', 'conversations', 'evaluations', 'goal_completions', 'scenarios', 'vocabulary', 'corrections', 'vocabulary_encounters', 'share_tokens', 'scenario_goals'];

  for (const table of tables) {
    const cols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = ${table}
      ORDER BY ordinal_position;
    `;
    console.log(`\n=== ${table} ===`);
    for (const col of cols) {
      console.log(`  ${col.column_name}: ${col.data_type} nullable=${col.is_nullable}`);
    }
  }
}

main().catch(console.error);
