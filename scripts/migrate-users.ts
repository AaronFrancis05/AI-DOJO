import 'dotenv/config';
import { db } from '../src/db';
import { users } from '../src/schema';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;
const COOKIE_SECRET = process.env.NEON_AUTH_COOKIE_SECRET;

if (!NEON_AUTH_BASE_URL || !COOKIE_SECRET) {
  console.error('ERROR: NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set in .env');
  process.exit(1);
}

async function getExistingUsers() {
  const result = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  console.log(`Found ${result.length} existing users in the database.\n`);
  return result;
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
  const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM user_id_migration_map;`);
  return result.rows[0]?.count as number ?? 0;
}

async function getUserCount() {
  const result = await db.execute(sql`SELECT COUNT(*)::int as count FROM users;`);
  return result.rows[0]?.count as number ?? 0;
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

    const baseOrigin = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:3000`;
    const failed: Array<{ email: string; error: string }> = [];

    for (let i = 0; i < toMigrate.length; i++) {
      const user = toMigrate[i];
      process.stdout.write(`  [${i + 1}/${toMigrate.length}] ${user.email}... `);
      try {
        const password = crypto.randomBytes(24).toString('hex');

        // Try calling the sign-up endpoint through our own Next.js dev server.
        // If a dev server is running on port 3000, it will proxy to Neon Auth
        // and the callback URL will match localhost.
        const res = await fetch(`${NEON_AUTH_BASE_URL}/sign-up/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': baseOrigin,
          },
          body: JSON.stringify({
            email: user.email,
            password,
            name: user.name,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${res.status} ${body}`);
        }

        const data = await res.json();
        const newId: string = data?.user?.id || data?.id;
        if (!newId) {
          throw new Error(`No id in response: ${JSON.stringify(data)}`);
        }

        await storeMapping(user.id, newId, user.email);
        console.log(`OK (id: ${newId})`);
      } catch (err: any) {
        console.log(`FAILED`);
        failed.push({ email: user.email, error: err.message || String(err) });
      }
    }

    if (failed.length > 0) {
      console.log(`\n${failed.length} user(s) failed to migrate:`);
      for (const f of failed) {
        console.log(`  - ${f.email}: ${f.error}`);
      }

      const callbackErrors = failed.filter(f =>
        f.error.includes('INVALID_CALLBACKURL')
      );
      if (callbackErrors.length > 0) {
        console.log(`\n💡 Tip: In the Neon Console at https://console.neon.tech:`);
        console.log(`   1. Select your project`);
        console.log(`   2. Go to Auth → Configuration`);
        console.log(`   3. Add "${baseOrigin}" to the allowed callback URLs / origins list`);
        console.log(`   4. Then retry: npx tsx scripts/migrate-users.ts`);
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
