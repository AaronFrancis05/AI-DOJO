import 'dotenv/config';
import { db } from '../src/db';
import * as schema from '../src/schema';
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

  const tableNames = Object.keys(schema).filter(
    (k) => (schema as Record<string, unknown>)[k]?.constructor?.name === 'PgTable'
  );

  for (const name of tableNames) {
    const table = (schema as Record<string, unknown>)[name];
    const rows = await db.select().from(table as any);
    result[name] = rows;
    console.log(`  ${name}: ${rows.length} rows`);
  }

  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  const stats = fs.statSync(filePath);
  console.log(`\nBackup saved to: ${filePath}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`Tables backed up: ${tableNames.length}`);

  if (stats.size === 0) {
    console.error('ERROR: Backup file is empty!');
    process.exit(1);
  }
}

backup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
