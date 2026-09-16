import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
};

const r = await db.execute<ColumnRow>(sql`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name IN ('users','sessions','conversations','evaluations','goal_completions')
  ORDER BY table_name, ordinal_position;
`);
for (const row of r.rows) {
  console.log(`${row.table_name}.${row.column_name}: ${row.data_type} nullable=${row.is_nullable}`);
}
