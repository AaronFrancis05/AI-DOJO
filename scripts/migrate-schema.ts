import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

type TableConfig = {
  name: string;
  joinSql: string;
  isRequired: boolean;
};

const TABLES: TableConfig[] = [
  {
    name: 'sessions',
    joinSql: 't.user_id = m.old_user_id',
    isRequired: true,
  },
  {
    name: 'conversations',
    joinSql: '(SELECT s.user_id FROM sessions s WHERE s.id = t.session_id) = m.old_user_id',
    isRequired: false,
  },
  {
    name: 'evaluations',
    joinSql: '(SELECT s.user_id FROM sessions s WHERE s.id = t.session_id) = m.old_user_id',
    isRequired: false,
  },
  {
    name: 'goal_completions',
    joinSql: '(SELECT s.user_id FROM sessions s WHERE s.id = t.session_id) = m.old_user_id',
    isRequired: false,
  },
];

async function phase4() {
  console.log('=== Phase 4: Add user_id_new columns and backfill ===\n');

  for (const tbl of TABLES) {
    console.log(`Adding user_id_new to ${tbl.name}...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)}
      ADD COLUMN IF NOT EXISTS user_id_new text;
    `);
  }
  console.log();

  const mapCount = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM user_id_migration_map;
  `);
  console.log(`Migration map has ${mapCount.rows[0]?.count} entries.\n`);

  for (const tbl of TABLES) {
    console.log(`Backfilling ${tbl.name}.user_id_new...`);
    await db.execute(sql`
      UPDATE ${sql.identifier(tbl.name)} t
      SET user_id_new = m.new_user_id
      FROM user_id_migration_map m
      WHERE ${sql.raw(tbl.joinSql)};
    `);
    console.log(`  Done.`);
  }
  console.log();

  for (const tbl of TABLES.slice(1)) {
    console.log(`Backfilling remaining ${tbl.name} rows via sessions.user_id...`);
    await db.execute(sql`
      UPDATE ${sql.identifier(tbl.name)} t
      SET user_id_new = sub.new_user_id
      FROM (
        SELECT c.id as cid, m.new_user_id
        FROM ${sql.identifier(tbl.name)} c
        JOIN sessions s ON s.id = c.session_id
        JOIN user_id_migration_map m ON m.old_user_id = s.user_id
        WHERE c.user_id_new IS NULL
      ) sub
      WHERE t.id = sub.cid;
    `);
  }
  console.log();

  console.log('=== Zero NULLs check ===\n');
  let allClean = true;
  for (const tbl of TABLES) {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM ${sql.identifier(tbl.name)} WHERE user_id_new IS NULL;
    `);
    const nullCount = result.rows[0]?.count as number ?? 0;
    const status = nullCount === 0 ? '✓' : '✗';
    console.log(`  ${status} ${tbl.name}: ${nullCount} rows with NULL user_id_new`);
    if (nullCount > 0) allClean = false;
  }

  if (allClean) {
    console.log(`\n✓ All tables ready.`);
  } else {
    console.log(`\n✗ NULLs found.`);
    process.exit(1);
  }
}

async function phase5() {
  console.log('\n=== Phase 5: Migrate users.id to text, then child tables ===\n');

  // Step 5a: Add id_new (text) to users table and backfill
  console.log('Adding id_new to users table...');
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_new text;`);

  console.log('Backfilling users.id_new from migration map...');
  await db.execute(sql`
    UPDATE users u
    SET id_new = m.new_user_id
    FROM user_id_migration_map m
    WHERE u.id = m.old_user_id;
  `);

  const nullUsers = await db.execute(sql`SELECT COUNT(*)::int as count FROM users WHERE id_new IS NULL;`);
  if ((nullUsers.rows[0]?.count as number) > 0) {
    console.error('ERROR: Some users have no id_new. Aborting.');
    process.exit(1);
  }
  console.log('  All users have id_new mapped.\n');

  // Step 5b: Drop old FK constraints on child tables first
  for (const tbl of TABLES) {
    console.log(`Dropping FK constraints on ${tbl.name}...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)} DROP CONSTRAINT IF EXISTS ${sql.identifier(`${tbl.name}_user_id_fkey`)};
    `);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)} DROP CONSTRAINT IF EXISTS ${sql.identifier(`${tbl.name}_user_id_new_fkey`)};
    `);
  }

  // Step 5c: Also drop FK on users table (from sessions.user_id)
  console.log('Dropping FK on sessions referencing users.id...');
  await db.execute(sql`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;`);

  // Also any other FKs referencing users.id
  for (const tbl of ['conversations', 'evaluations', 'goal_completions']) {
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl)} DROP CONSTRAINT IF EXISTS ${sql.identifier(`${tbl}_user_id_fkey`)};
    `);
  }

  // Step 5d: Drop old users.id column, rename id_new to id, make PK
  console.log('\nDropping old users.id (serial) with CASCADE...');
  await db.execute(sql`ALTER TABLE users DROP COLUMN id CASCADE;`);

  console.log('Renaming users.id_new → id...');
  await db.execute(sql`ALTER TABLE users RENAME COLUMN id_new TO id;`);

  console.log('Adding primary key to users.id...');
  // Drop existing PK first
  await db.execute(sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;`);
  await db.execute(sql`ALTER TABLE users ADD PRIMARY KEY (id);`);

  // Step 5e: Now handle child tables
  for (const tbl of TABLES) {
    const hasOldCol = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = ${tbl.name} AND column_name = 'user_id';
    `);

    if (hasOldCol.rows.length > 0) {
      console.log(`Dropping old ${tbl.name}.user_id (integer)...`);
      await db.execute(sql`
        ALTER TABLE ${sql.identifier(tbl.name)} DROP COLUMN user_id;
      `);
    } else {
      console.log(`No old user_id column in ${tbl.name}, skipping drop.`);
    }

    console.log(`Renaming user_id_new → user_id in ${tbl.name}...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)} RENAME COLUMN user_id_new TO user_id;
    `);
  }

  // Step 5f: Add NOT NULL where required
  for (const tbl of TABLES.filter(t => t.isRequired)) {
    console.log(`Adding NOT NULL to ${tbl.name}.user_id...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)} ALTER COLUMN user_id SET NOT NULL;
    `);
  }

  // Step 5g: Add FK constraints referencing users(id)
  for (const tbl of TABLES) {
    console.log(`Adding FK constraint to ${tbl.name}.user_id → users.id...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)}
      ADD CONSTRAINT ${sql.identifier(`${tbl.name}_user_id_fkey`)}
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `);
  }

  console.log('\n✓ Phase 5 complete.');
}

async function verify() {
  console.log('\n=== Final Verification ===\n');
  const checkTables = ['users', 'sessions', 'conversations', 'evaluations', 'goal_completions', 'user_id_migration_map'];
  for (const tbl of checkTables) {
    const dt = await db.execute(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = ${tbl} AND (column_name = 'id' OR column_name = 'user_id');
    `);
    if (dt.rows.length > 0) {
      console.log(`  ${tbl}: ${dt.rows.map((r: any) => `${r.column_name}=${r.data_type}`).join(', ')}`);
    }
  }
  const rowCounts = await db.execute(sql`
    SELECT 'users' as tbl, COUNT(*)::int as cnt FROM users
    UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
    UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
    UNION ALL SELECT 'evaluations', COUNT(*) FROM evaluations
    UNION ALL SELECT 'goal_completions', COUNT(*) FROM goal_completions;
  `);
  console.log();
  for (const r of rowCounts.rows) {
    console.log(`  ${(r as any).tbl}: ${(r as any).cnt} rows`);
  }
}

const phase = process.argv[2];
if (phase === '4') phase4().catch(console.error);
else if (phase === '5') phase5().catch(console.error);
else if (phase === 'verify') verify().catch(console.error);
else console.log('Usage: npx tsx scripts/migrate-schema.ts <4|5|verify>');
