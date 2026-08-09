/**
 * Apply pending drizzle migrations with per-file logging.
 * Replaces `drizzle-kit migrate`, which only shows a spinner.
 *
 * Usage: npm run db:migrate
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
};

const sql = neon(process.env.DATABASE_URL!);
const drizzleDir = join(process.cwd(), 'drizzle');
const journal = JSON.parse(
  readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8'),
) as { entries: JournalEntry[] };

/**
 * Neon HTTP/websocket drivers reject multi-command prepared statements.
 * Drizzle SQL may use `--> statement-breakpoint`, plain `;`, or both
 * (0016–0018 are hand-written multi-statement files without breakpoints).
 */
function splitStatements(query: string): string[] {
  const chunks = query.includes('--> statement-breakpoint')
    ? query.split('--> statement-breakpoint')
    : [query];

  const statements: string[] = [];
  for (const chunk of chunks) {
    const withoutLineComments = chunk
      .split('\n')
      .map((line) => {
        const idx = line.indexOf('--');
        return idx >= 0 ? line.slice(0, idx) : line;
      })
      .join('\n');

    for (const part of withoutLineComments.split(';')) {
      const trimmed = part.trim();
      if (trimmed) statements.push(trimmed);
    }
  }
  return statements;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const latest = await sql`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const watermark = latest[0] ? Number(latest[0].created_at) : null;

  const pending = journal.entries.filter(
    (entry) => watermark === null || entry.when > watermark,
  );

  console.log(
    watermark === null
      ? 'No migration history found — will apply all journal entries.'
      : `Watermark created_at=${watermark} (${latest[0]!.hash.toString().slice(0, 12)}…)`,
  );

  if (pending.length === 0) {
    console.log('Nothing to migrate — database is up to date.');
    return;
  }

  console.log(`\nPending (${pending.length}):`);
  for (const entry of pending) {
    console.log(`  - ${entry.tag}`);
  }
  console.log('');

  for (const entry of pending) {
    const filePath = join(drizzleDir, `${entry.tag}.sql`);
    const query = readFileSync(filePath, 'utf8');
    const hash = createHash('sha256').update(query).digest('hex');
    const statements = splitStatements(query);

    process.stdout.write(`Applying ${entry.tag} (${statements.length} statements)... `);
    for (const statement of statements) {
      await sql.query(statement, []);
    }
    await sql`
      INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
      VALUES (${hash}, ${entry.when})
    `;
    console.log('done');
  }

  console.log(`\nApplied ${pending.length} migration(s).`);
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
