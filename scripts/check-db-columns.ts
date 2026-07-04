import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

const r = await db.execute(sql`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name IN ('users','sessions','conversations','evaluations','goal_completions')
  ORDER BY table_name, ordinal_position;
`);
for (const row of r.rows) {
  console.log(`${(row as any).table_name}.${(row as any).column_name}: ${(row as any).data_type} nullable=${(row as any).is_nullable}`);
}
