import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

// Get all migrated users from the map
const mapResult = await db.execute(sql`
  SELECT old_user_id, new_user_id, email FROM user_id_migration_map;
`);

if (mapResult.rows.length === 0) {
  console.log('No migrated users found in user_id_migration_map.');
  process.exit(0);
}

console.log(`Found ${mapResult.rows.length} migrated users. Updating emailVerified to true...`);

for (const row of mapResult.rows) {
  const u = row as any;
  await db.execute(sql`
    UPDATE neon_auth."user"
    SET "emailVerified" = true
    WHERE id = ${u.new_user_id};
  `);
  console.log(`  ✓ ${u.email} (${u.new_user_id})`);
}

// Verify
const verifyResult = await db.execute(sql`
  SELECT id, email, "emailVerified"
  FROM neon_auth."user"
  WHERE "emailVerified" = false;
`);

if (verifyResult.rows.length === 0) {
  console.log('\n✓ All users verified. No unverified users remain.');
} else {
  console.log(`\n⚠ ${verifyResult.rows.length} user(s) still unverified:`);
  for (const row of verifyResult.rows) {
    const u = row as any;
    console.log(`  - ${u.email} (${u.id})`);
  }
}
