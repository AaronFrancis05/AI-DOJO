import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

// Use drizzle's sql tagged template directly
try {
  const result = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' ORDER BY column_name`);
  console.log('Drizzle result type:', typeof result);
  console.log('Drizzle result keys:', Object.keys(result));
  if (result.rows) {
    console.log('Columns:', result.rows.map(r => r.column_name).join(', '));
  }
} catch (e) {
  console.error('Error:', e.message);
}
