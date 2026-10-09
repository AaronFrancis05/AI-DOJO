import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

type ForeignKeyRow = {
  table_name: string;
  conname: string;
  def: string;
};

const r = await db.execute<ForeignKeyRow>(sql`
  SELECT conname, conrelid::regclass::text AS table_name, confrelid::regclass::text AS ref_table, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE contype = 'f'
  ORDER BY table_name;
`);
for (const row of r.rows) {
  console.log(`${row.table_name}: ${row.conname} => ${row.def}`);
}
