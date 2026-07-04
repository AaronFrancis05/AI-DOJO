import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

const r = await db.execute(sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'neon_auth' AND table_name = 'user'
  ORDER BY ordinal_position;
`);
for (const row of r.rows) {
  console.log(`${(row as any).column_name}: ${(row as any).data_type} nullable=${(row as any).is_nullable}`);
}
