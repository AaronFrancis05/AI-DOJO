import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

const r = await db.execute(sql`
  SELECT conname, conrelid::regclass::text AS table_name, confrelid::regclass::text AS ref_table, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE contype = 'f'
  ORDER BY table_name;
`);
for (const row of r.rows) {
  console.log(`${(row as any).table_name}: ${(row as any).conname} => ${(row as any).def}`);
}
