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

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Neon HTTP/websocket drivers reject multi-command prepared statements.
 * Drizzle SQL may use `--> statement-breakpoint`, plain `;`, or both
 * (0016–0018 are hand-written multi-statement files without breakpoints).
 *
 * Splits on `;` and strips `--` comments only OUTSIDE quotes. The previous
 * version split on every `;` and cut every line at `--`, so a default like
 * `DEFAULT 'a;b'`, a comment text such as `'see -- note'`, or a `$$` function
 * body would have been torn into broken statements.
 */
function splitStatements(query: string): string[] {
  const chunks = query.includes('--> statement-breakpoint')
    ? query.split('--> statement-breakpoint')
    : [query];

  const statements: string[] = [];
  for (const chunk of chunks) {
    let current = '';
    let i = 0;
    const flush = () => {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    };
    while (i < chunk.length) {
      const ch = chunk[i];
      const next = chunk[i + 1];
      if (ch === '-' && next === '-') {
        // Line comment: dropped up to (not including) the newline.
        while (i < chunk.length && chunk[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        const close = chunk.indexOf('*/', i + 2);
        i = close < 0 ? chunk.length : close + 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        // Quoted literal or identifier; a doubled quote is an escaped quote.
        let j = i + 1;
        while (j < chunk.length) {
          if (chunk[j] === ch && chunk[j + 1] === ch) { j += 2; continue; }
          if (chunk[j] === ch) break;
          j++;
        }
        current += chunk.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (ch === '$') {
        // Dollar-quoted body: $$ ... $$ or $tag$ ... $tag$.
        const tag = /^\$[A-Za-z_]*\$/.exec(chunk.slice(i))?.[0];
        if (tag) {
          const close = chunk.indexOf(tag, i + tag.length);
          const stop = close < 0 ? chunk.length : close + tag.length;
          current += chunk.slice(i, stop);
          i = stop;
          continue;
        }
      }
      if (ch === ';') {
        flush();
        i++;
        continue;
      }
      current += ch;
      i++;
    }
    flush();
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

  /**
   * Pending work is a set difference on hashes: apply every journal entry whose
   * file hash has no row in __drizzle_migrations. This is what drizzle-kit
   * itself does, and it is the only selection that survives a non-monotonic
   * journal.
   *
   * It replaces a `created_at` watermark, which silently stopped applying
   * anything after 0020: entries 18/19/20 carry hand-rounded `when` values
   * dated ahead of every later entry, so the watermark sat permanently in the
   * future and `entry.when > watermark` never matched again. The script
   * reported "Nothing to migrate" and exited 0 — it looked like success, which
   * is why it went unnoticed through eleven migrations.
   *
   * A row counts as a match on EITHER the raw-byte digest or the LF-normalized
   * one, because this history contains both: most rows were recorded from raw
   * bytes, but 0033's was recorded LF-normalized. Hashing raw bytes alone makes
   * the applied-set line-ending dependent, so a Windows checkout (or any
   * `core.autocrlf` change) makes already-applied migrations look pending.
   * New rows record the normalized digest, which describes the SQL rather than
   * the checkout it happened to be applied from.
   */
  const appliedRows = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
  const applied = new Set(appliedRows.map((row) => String(row.hash)));

  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
  const hashes = new Map<number, { record: string; accepted: string[] }>();
  for (const entry of entries) {
    const raw = readFileSync(join(drizzleDir, `${entry.tag}.sql`), 'utf8');
    const normalized = raw.replace(/\r\n/g, '\n');
    hashes.set(entry.idx, {
      // Recorded LF-normalized, so the digest describes the SQL rather than the
      // checkout it was applied from.
      record: sha256(normalized),
      accepted: [sha256(normalized), sha256(raw)],
    });
  }

  const isApplied = (entry: JournalEntry) =>
    hashes.get(entry.idx)!.accepted.some((h) => applied.has(h));

  const pending = entries.filter((entry) => !isApplied(entry));

  console.log(
    applied.size === 0
      ? 'No migration history found — will apply all journal entries.'
      : `${applied.size} migration(s) already applied.`,
  );

  if (pending.length === 0) {
    console.log('Nothing to migrate — database is up to date.');
    return;
  }

  /**
   * A pending entry sitting *behind* one that has already been applied is not
   * the normal case, and the hash cannot say which of the two causes it is:
   *
   *   - the file was edited after it was applied, so replaying it would run
   *     `CREATE TABLE` against a schema that already has the table; or
   *   - the migration was genuinely skipped and its objects are missing.
   *
   * Those need opposite responses, so refuse and make the operator look. Check
   * in the database whether the objects the file creates exist, then either
   * restore the file or re-run with --force to apply it.
   */
  const lastApplied = entries.filter(isApplied).at(-1);
  const outOfOrder = lastApplied ? pending.filter((e) => e.idx < lastApplied.idx) : [];
  if (outOfOrder.length > 0 && !process.argv.includes('--force')) {
    console.error(
      `\nRefusing to run: ${outOfOrder.length} migration(s) before ${lastApplied!.tag} have no ` +
        `matching hash (${outOfOrder.map((e) => e.tag).join(', ')}).\n` +
        'Either they were skipped and their objects are missing, or the files changed after they ' +
        'were applied — the hash cannot tell those apart, and they need opposite fixes.\n' +
        'Check the database for the objects each one creates, then restore the file, or re-run ' +
        'with --force to apply them.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nPending (${pending.length}):`);
  for (const entry of pending) {
    console.log(`  - ${entry.tag}`);
  }
  console.log('');

  for (const entry of pending) {
    const query = readFileSync(join(drizzleDir, `${entry.tag}.sql`), 'utf8');
    // The hash recorded is the one selection was made on, so a file that
    // changes between the two reads cannot be recorded under the wrong digest.
    const hash = hashes.get(entry.idx)!.record;
    const statements = splitStatements(query);

    process.stdout.write(`Applying ${entry.tag} (${statements.length} statements)... `);
    // One transaction per file, history row included. Statement-by-statement
    // execution left a failed file half-applied and unrecorded, so the rerun
    // then failed on the objects its first half had already created. Postgres
    // DDL is transactional, so now a file lands whole or not at all.
    // (A future migration needing CREATE INDEX CONCURRENTLY, which cannot run
    // in a transaction, must be applied by hand.)
    await sql.transaction([
      ...statements.map((statement) => sql.query(statement, [])),
      sql`
        INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
        VALUES (${hash}, ${entry.when})
      `,
    ]);
    console.log('done');
  }

  console.log(`\nApplied ${pending.length} migration(s).`);
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
