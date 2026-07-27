import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('Applying migration 0020...');
  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp;`;
  console.log('Migration 0020 applied successfully.');
}

main().catch(console.error);
