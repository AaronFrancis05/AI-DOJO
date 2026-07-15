import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const raw = fs.readFileSync('drizzle/0007_marvelous_wind_dancer.sql', 'utf-8');
const statements = raw.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

// Use the pooled URL (same as app) with .query() for DDL
const sql = neon(process.env.DATABASE_URL);

for (const stmt of statements) {
  process.stdout.write('Running: ' + stmt.substring(0, 60) + '... ');
  try {
    // Use .query() which accepts raw SQL strings
    await sql.query(stmt);
    console.log('OK');
  } catch (e) {
    console.log('FAILED:', e.message?.substring(0, 120));
  }
}

const dbInfo = await sql.query("SELECT current_database() AS db, current_schema() AS schema, version() AS ver");
console.log('Database info:', JSON.stringify(Array.isArray(dbInfo) ? dbInfo[0] : dbInfo, null, 2));

const verifyResult = await sql.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' ORDER BY column_name");
const rows = Array.isArray(verifyResult) ? verifyResult : verifyResult.rows;
console.log('\nsessions columns:', rows.map(r => r.column_name).join(', '));
const hasTarget = rows.some(r => r.column_name === 'target_language');
console.log('target_language present:', hasTarget);
