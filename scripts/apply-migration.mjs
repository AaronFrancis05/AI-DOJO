import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const raw = fs.readFileSync('drizzle/0007_marvelous_wind_dancer.sql', 'utf-8');
const statements = raw.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

// Use direct (non-pooled) connection for DDL statements
const directUrl = process.env.DATABASE_URL.replace('-pooler', '');
console.log('Using direct URL (no pooler)');
const sql = neon(directUrl);

for (const stmt of statements) {
  process.stdout.write('Running: ' + stmt.substring(0, 60) + '... ');
  try {
    await sql.unsafe(stmt);
    console.log('OK');
  } catch (e) {
    console.log('FAILED:', e.message.substring(0, 100));
  }
}

// Verify
const check = await sql.unsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' ORDER BY column_name");
console.log('\nsessions columns:', check.map(r => r.column_name).join(', '));
const hasTarget = check.some(r => r.column_name === 'target_language');
console.log('target_language column present:', hasTarget);
