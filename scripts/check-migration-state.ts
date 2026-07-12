import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Check if tables already exist
  const tables = await db.execute(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND table_name IN ('domains', 'situations', 'characters')
    ORDER BY table_name
  `);
  console.log('New tables already present:', JSON.stringify(tables, null, 2));

  // Check if columns already exist
  const scenarioCols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='scenarios' AND column_name='situation_id'
  `);
  console.log('scenarios.situation_id exists:', scenarioCols.rows.length > 0);

  const sessionsCols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='sessions' AND column_name IN ('situation_id', 'character_id', 'behavior_mode')
    ORDER BY column_name
  `);
  console.log('sessions new cols:', JSON.stringify(sessionsCols, null, 2));
}

main().catch(console.error);
