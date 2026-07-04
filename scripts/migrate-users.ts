import 'dotenv/config';
import { db } from '../src/db';
import { users } from '../src/schema';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;

if (!NEON_AUTH_BASE_URL) {
  console.error('ERROR: NEON_AUTH_BASE_URL is not set. Add it to .env first.');
  console.error('Get it from Neon Console → your project → Auth → Configuration.');
  process.exit(1);
}

async function getExistingUsers() {
  const result = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  console.log(`Found ${result.length} existing users in the database.\n`);
  return result;
}

async function createNeonAuthUser(email: string, name: string) {
  const password = crypto.randomBytes(24).toString('hex');
  const res = await fetch(`${NEON_AUTH_BASE_URL}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Neon Auth account for ${email}: ${res.status} ${body}`);
  }
  const data = await res.json();
  const newId: string = data?.user?.id || data?.id;
  if (!newId) {
    throw new Error(`No user id returned for ${email}. Response: ${JSON.stringify(data)}`);
  }
  return { newId, email };
}

async function ensureMigrationMapTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_id_migration_map (
      old_user_id integer PRIMARY KEY,
      new_user_id text NOT NULL,
      email text NOT NULL,
      migrated_at timestamp DEFAULT now()
    );
  `);
  console.log('Ensured user_id_migration_map table exists.\n');
}

async function storeMapping(oldUserId: number, newUserId: string, email: string) {
  await db.execute(sql`
    INSERT INTO user_id_migration_map (old_user_id, new_user_id, email)
    VALUES (${oldUserId}, ${newUserId}, ${email})
    ON CONFLICT (old_user_id) DO UPDATE SET new_user_id = ${newUserId}, email = ${email};
  `);
}

async function getMigrationCount() {
  const result = await db.execute(sql`SELECT COUNT(*) as count FROM user_id_migration_map;`);
  return Number(result.rows[0]?.count || 0);
}

async function getUserCount() {
  const result = await db.execute(sql`SELECT COUNT(*) as count FROM users;`);
  return Number(result.rows[0]?.count || 0);
}

async function main() {
  console.log('=== Neon Auth User Migration ===\n');

  await ensureMigrationMapTable();

  const existingUsers = await getExistingUsers();
  const alreadyMigrated = await getMigrationCount();
  console.log(`Already migrated: ${alreadyMigrated} users`);

  const toMigrate = existingUsers.slice(alreadyMigrated);

  if (toMigrate.length === 0) {
    console.log('All users already migrated. Moving to verification...');
  } else {
    console.log(`Migrating ${toMigrate.length} users...\n`);
    const failed: Array<{ email: string; error: string }> = [];

    for (let i = 0; i < toMigrate.length; i++) {
      const user = toMigrate[i];
      process.stdout.write(`  [${i + 1}/${toMigrate.length}] ${user.email}... `);
      try {
        const { newId } = await createNeonAuthUser(user.email, user.name);
        await storeMapping(user.id, newId, user.email);
        console.log(`OK (id: ${newId})`);
      } catch (err: any) {
        console.log(`FAILED`);
        failed.push({ email: user.email, error: err.message });
      }
    }

    if (failed.length > 0) {
      console.log(`\n${failed.length} user(s) failed to migrate:`);
      for (const f of failed) {
        console.log(`  - ${f.email}: ${f.error}`);
      }
      process.exit(1);
    }
  }

  const migratedCount = await getMigrationCount();
  const userCount = await getUserCount();

  console.log(`\n=== Verification ===`);
  console.log(`  Users table:        ${userCount}`);
  console.log(`  Migration map:      ${migratedCount}`);

  if (migratedCount === userCount) {
    console.log(`\n✓ All ${userCount} users migrated successfully.`);
  } else {
    console.log(`\n✗ MISMATCH: ${userCount - migratedCount} user(s) not in migration map.`);
    process.exit(1);
  }

  console.log('\nUsers and their new Neon Auth IDs:');
  const mapRows = await db.execute(sql`
    SELECT m.old_user_id, m.new_user_id, m.email, u.name
    FROM user_id_migration_map m
    LEFT JOIN users u ON u.id = m.old_user_id
    ORDER BY m.old_user_id;
  `);
  for (const row of mapRows.rows) {
    console.log(`  ${(row as any).old_user_id} → ${(row as any).new_user_id}  (${(row as any).email})`);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
