/* ─────────────────────────────────────────────────────────────
   One-off backfill: `tutors.instruction_languages` (PLAN.md 4.5).

   Tutors who applied before the column existed have none, so no lesson can
   be explained in a language they share with a learner, chat translation has
   nothing to pair against, and the shared-language ranking (PLAN.md 4.8
   part 7) never puts them first for a beginner.

   Each such tutor gets their own account's native language — the one
   language we know they speak — plus English when they teach it (they
   explain English through English). Only native languages the catalogue
   actually offers are written. Tutors should then add the rest (Swahili,
   French, Arabic, Kinyarwanda…) from their profile.

   Usage:
      npm run db:backfill-tutor-instruction-languages             # dry run: prints what would change
      npm run db:backfill-tutor-instruction-languages -- --apply  # writes

   Idempotent: only rows whose instruction_languages is NULL or empty are
   touched, so a rerun changes nothing that was already filled.
   ───────────────────────────────────────────────────────────── */
import { eq, isNull, or } from 'drizzle-orm';
import { db } from '../src/db';
import { tutors, users } from '../src/schema';
import { parseLanguageCodes, serializeLanguageCodes } from '../lib/tutors/languages';
import { loadLanguageCatalog } from '../lib/language-registry';

async function main() {
  const apply = process.argv.includes('--apply');
  const catalog = await loadLanguageCatalog();
  const offered = new Set(catalog.native.map((l) => l.code));

  const rows = await db
    .select({
      id: tutors.id,
      languages: tutors.languages,
      instructionLanguages: tutors.instructionLanguages,
      nativeLanguage: users.nativeLanguage,
      name: users.name,
    })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(or(isNull(tutors.instructionLanguages), eq(tutors.instructionLanguages, '')));

  let changed = 0;
  for (const row of rows) {
    const taught = parseLanguageCodes(row.languages);
    const codes = [row.nativeLanguage, ...(taught.includes('en') ? ['en'] : [])]
      .filter((code, i, all) => offered.has(code) && all.indexOf(code) === i);
    if (codes.length === 0) {
      console.log(`  skip tutor ${row.id} (${row.name}): no offered native language to assign`);
      continue;
    }
    console.log(`  tutor ${row.id} (${row.name}): instruction_languages = ${codes.join(',')}`);
    if (apply) {
      await db.update(tutors).set({ instructionLanguages: serializeLanguageCodes(codes) }).where(eq(tutors.id, row.id));
    }
    changed++;
  }

  console.log(`${apply ? 'Updated' : 'Would update'} ${changed} of ${rows.length} tutors without instruction languages.`);
  if (!apply && changed > 0) console.log('Run again with --apply to write.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
