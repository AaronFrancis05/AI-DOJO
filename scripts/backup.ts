import 'dotenv/config';
import { db } from '../src/db';
import * as schema from '../src/schema';
import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function backup() {
  const backupDir = path.resolve(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupDir, `backup-${timestamp}.json`);

  const result: Record<string, unknown[]> = {};

  const tableEntries = Object.entries(schema).filter(
    (entry): entry is [string, PgTable] => is(entry[1], PgTable)
  );

  for (const [name, table] of tableEntries) {
    const rows = await db.select().from(table);
    result[name] = rows;
    console.log(`  ${name}: ${rows.length} rows`);
  }

  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  const stats = fs.statSync(filePath);
  console.log(`\nBackup saved to: ${filePath}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`Tables backed up: ${tableEntries.length}`);

  if (stats.size === 0) {
    console.error('ERROR: Backup file is empty!');
    process.exit(1);
  }
}

backup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
