import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const db = drizzle(neon(process.env.DATABASE_URL));

async function tableExists(tableName) {
  const res = await db.execute(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = '${tableName}'`
  );
  return res.rows.length > 0;
}

const tables = ['user_settings', 'chat_messages'];
for (const table of tables) {
  const exists = await tableExists(table);
  console.log(`${table} exists:`, exists);
}

if (!(await tableExists('user_settings'))) {
  console.log('Creating user_settings table...');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS \"user_settings\" (
      \"user_id\" varchar(255) PRIMARY KEY NOT NULL,
      \"ui_language\" varchar(8) DEFAULT 'en',
      \"response_language\" varchar(8) DEFAULT 'ja',
      \"last_avatar\" varchar(255)
    );
  `);
  console.log('user_settings exists after create:', await tableExists('user_settings'));
}

if (!(await tableExists('chat_messages'))) {
  console.log('Creating chat_messages table...');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS \"chat_messages\" (
      \"id\" serial PRIMARY KEY NOT NULL,
      \"user_id\" varchar(255) NOT NULL,
      \"character_name\" varchar(255),
      \"role\" varchar(16) NOT NULL,
      \"content\" text NOT NULL DEFAULT '',
      \"text\" text,
      \"text_en\" text,
      \"text_ja\" text,
      \"time\" timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  console.log('chat_messages exists after create:', await tableExists('chat_messages'));
}
