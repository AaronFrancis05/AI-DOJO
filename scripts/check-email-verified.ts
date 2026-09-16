import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

const r = await db.execute<Record<string, unknown>>(sql`
  SELECT *
  FROM neon_auth."user"
  ORDER BY "createdAt";
`);
for (const row of r.rows) {
  console.log(JSON.stringify(row));
}
