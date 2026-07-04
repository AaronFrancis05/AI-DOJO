import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

const r = await db.execute(sql`
  SELECT *
  FROM neon_auth."user"
  ORDER BY "createdAt";
`);
for (const row of r.rows) {
  const u = row as any;
  console.log(JSON.stringify(u));
}
