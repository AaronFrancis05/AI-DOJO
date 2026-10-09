import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

type AuthColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
};

const r = await db.execute<AuthColumnRow>(sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'neon_auth' AND table_name = 'user'
  ORDER BY ordinal_position;
`);
for (const row of r.rows) {
  console.log(`${row.column_name}: ${row.data_type} nullable=${row.is_nullable}`);
}
