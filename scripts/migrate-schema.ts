import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

type TableConfig = {
  name: string;
  /** SQL JOIN to reach the user_id from this table's rows */
  joinSql: string;
  /** Whether user_id should be NOT NULL after migration */
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

  // Step 4a: Add user_id_new (text) columns
  for (const tbl of TABLES) {
    console.log(`Adding user_id_new to ${tbl.name}...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)}
      ADD COLUMN IF NOT EXISTS user_id_new text;
    `);
  }
  console.log();

  // Step 4b: Verify migration map exists and has data
  const mapCount = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM user_id_migration_map;
  `);
  console.log(`Migration map has ${mapCount.rows[0]?.count} entries.\n`);

  // Step 4c: Backfill user_id_new from the migration map via the join chain
  for (const tbl of TABLES) {
    console.log(`Backfilling ${tbl.name}.user_id_new...`);
    const result = await db.execute(sql`
      UPDATE ${sql.identifier(tbl.name)} t
      SET user_id_new = m.new_user_id
      FROM user_id_migration_map m
      WHERE ${sql.raw(tbl.joinSql)};
    `);
    console.log(`  ${result.rowCount ?? '?'} rows updated.`);
  }
  console.log();

  // Step 4d: For tables with no direct user_id, backfill from sessions for any remaining
  console.log('Backfilling remaining rows via sessions.user_id...');
  for (const tbl of TABLES.slice(1)) {
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
    console.log(`  ${tbl.name}: remaining rows backfilled.`);
  }
  console.log();

  // Step 4e: Verify zero NULLs remain
  console.log('=== Verification: Zero NULLs check ===\n');
  let allClean = true;
  for (const tbl of TABLES) {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int as count
      FROM ${sql.identifier(tbl.name)}
      WHERE user_id_new IS NULL;
    `);
    const nullCount = result.rows[0]?.count as number ?? 0;
    const status = nullCount === 0 ? '✓' : '✗';
    console.log(`  ${status} ${tbl.name}: ${nullCount} rows with NULL user_id_new`);
    if (nullCount > 0) allClean = false;
  }

  if (allClean) {
    console.log(`\n✓ All tables have zero NULLs. Ready for Phase 5.`);
  } else {
    console.log(`\n✗ Some tables have NULL user_id_new.`);
    const totalNulls = await db.execute(sql`
      SELECT 'sessions' as name, COUNT(*)::int as n FROM sessions WHERE user_id_new IS NULL
      UNION ALL SELECT 'conversations', COUNT(*) FROM conversations WHERE user_id_new IS NULL
      UNION ALL SELECT 'evaluations', COUNT(*) FROM evaluations WHERE user_id_new IS NULL
      UNION ALL SELECT 'goal_completions', COUNT(*) FROM goal_completions WHERE user_id_new IS NULL;
    `);
    for (const r of totalNulls.rows) {
      if ((r as any).n > 0) {
        console.log(`  ${(r as any).name}: ${(r as any).n} orphan rows`);
      }
    }
    process.exit(1);
  }
}

async function phase5() {
  console.log('\n=== Phase 5: Drop old columns, rename, add FK ===\n');

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

  // Add NOT NULL where required
  for (const tbl of TABLES.filter(t => t.isRequired)) {
    console.log(`Adding NOT NULL to ${tbl.name}.user_id...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)} ALTER COLUMN user_id SET NOT NULL;
    `);
  }

  // Add FK constraints
  for (const tbl of TABLES) {
    const hasFk = await db.execute(sql`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = ${tbl.name} AND constraint_type = 'FOREIGN KEY';
    `);

    console.log(`Adding FK constraint to ${tbl.name}.user_id → users.id...`);
    await db.execute(sql`
      ALTER TABLE ${sql.identifier(tbl.name)}
      ADD CONSTRAINT ${sql.identifier(`${tbl.name}_user_id_fkey`)}
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    `);
  }

  console.log('\n✓ Phase 5 complete.');
}

async function verifyPhase5() {
  console.log('\n=== Final Verification ===\n');

  const verifyTables = [...TABLES, { name: 'user_id_migration_map', joinSql: '' as string, isRequired: false }, { name: 'users', joinSql: '' as string, isRequired: false }];

  for (const tbl of verifyTables) {
    try {
      const dt = await db.execute(sql`
        SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_name = ${tbl.name} AND column_name = 'id';
      `);
      const userIdDt = await db.execute(sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = ${tbl.name} AND column_name = 'user_id';
      `);
      const typeStr = userIdDt.rows.length > 0 ? `, user_id=${userIdDt.rows[0]?.data_type}` : '';
      console.log(`  ${tbl.name}: id=${dt.rows[0]?.data_type}${typeStr}`);
    } catch { /* table might not exist */ }
  }

  const rowCounts = await db.execute(sql`
    SELECT 'sessions' as tbl, COUNT(*)::int as cnt FROM sessions
    UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
    UNION ALL SELECT 'evaluations', COUNT(*) FROM evaluations
    UNION ALL SELECT 'goal_completions', COUNT(*) FROM goal_completions
    UNION ALL SELECT 'user_id_migration_map', COUNT(*) FROM user_id_migration_map
    UNION ALL SELECT 'users', COUNT(*) FROM users;
  `);
  console.log();
  for (const r of rowCounts.rows) {
    console.log(`  ${(r as any).tbl}: ${(r as any).cnt} rows`);
  }
}

const phase = process.argv[2];

if (phase === '4') {
  phase4().catch(console.error);
} else if (phase === '5') {
  phase5().catch(console.error);
} else if (phase === 'verify') {
  verifyPhase5().catch(console.error);
} else {
  console.log('Usage: npx tsx scripts/migrate-schema.ts <4|5|verify>');
  console.log('  Phase 4: Add user_id_new columns, backfill, verify zero NULLs');
  console.log('  Phase 5: Drop old columns, rename, add FK constraints');
  console.log('  verify:  Check final state');
}
