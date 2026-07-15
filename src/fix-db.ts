import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { domains as domainFixtures } from '../lib/mock-data/domains';

async function run() {
  const sql = neon(process.env.DATABASE_URL!);
  try {
    console.log('Adding image_url column to domains table...');
    await sql`ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "image_url" text;`;
    console.log('Column added successfully.');

    console.log('Updating domain image URLs...');
    for (const d of domainFixtures) {
      if (d.imageUrl) {
        await sql`UPDATE "domains" SET "image_url" = ${d.imageUrl} WHERE "slug" = ${d.slug};`;
        console.log(`Updated ${d.slug} with ${d.imageUrl}`);
      }
    }
    console.log('Domain image URLs updated successfully.');

  } catch (error) {
    console.error('Error fixing database:', error);
  }
}

run();
