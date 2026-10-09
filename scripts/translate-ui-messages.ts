/* ─────────────────────────────────────────────────────────────
   Translate the UI message catalog (messages/en.json) into every enabled
   native language (PLAN.md 2.4).

   Idempotent: only keys that are missing in a locale, or whose English
   source changed since they were translated, are sent. The English text
   each translation was made from is recorded (as a short hash) in
   messages/.sources/<lang>.json, which is what "changed" is measured
   against — so an edit to an English string re-translates exactly that
   string everywhere and nothing else.

   Machine-first: the highest-traffic languages get a human review on top
   (PLAN.md "Content operations"). A reviewer's edit to messages/<lang>.json
   is kept, because the English source did not change.

   Usage:
     npm run i18n:translate                    # every enabled native language
     npm run i18n:translate -- --lang=ja       # one language
     npm run i18n:translate -- --dry-run       # show what would be sent
   ───────────────────────────────────────────────────────────── */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_LANGUAGES } from '../lib/language';
import { loadLanguageCatalog } from '../lib/language-registry';
import { getAIProvider, type AIProvider } from '../lib/ai-providers';
import { flattenMessages, placeholdersOf, unflattenMessages, type MessageTree } from '../lib/i18n/messages';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES_DIR = join(ROOT, 'messages');
const SOURCES_DIR = join(MESSAGES_DIR, '.sources');
// Small batches keep each response well inside output limits and make a
// failure cost one batch, not the whole language.
const BATCH_SIZE = 40;

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function buildPrompt(langName: string, langCode: string, batch: Record<string, string>): string {
  return `You translate the user interface of AI DOJO, an app where people practise speaking English (and other languages) with AI role-play and human tutors.

Translate each value below from English into ${langName} (${langCode}) for the app's buttons, menus, headings and short messages.
- Natural, concise UI wording a native speaker expects — not word-for-word.
- Keep every {placeholder} exactly as written, untranslated.
- Keep "AI DOJO", "XP" and other product names as they are.
- Use the polite/neutral register usual for software in ${langName}.

Return strictly a JSON object with exactly the same keys:
${JSON.stringify(batch, null, 2)}`;
}

async function translateLanguage(provider: AIProvider, code: string, name: string, dryRun: boolean): Promise<void> {
  const english = flattenMessages(readJson<MessageTree>(join(MESSAGES_DIR, 'en.json'), {}));
  const catalogPath = join(MESSAGES_DIR, `${code}.json`);
  const sourcesPath = join(SOURCES_DIR, `${code}.json`);
  const current = flattenMessages(readJson<MessageTree>(catalogPath, {}));
  const sources = readJson<Record<string, string>>(sourcesPath, {});

  const todo = Object.keys(english).filter((k) => !current[k] || sources[k] !== hash(english[k]));
  // Keys English no longer has are removed, so the CI check stays green.
  const stale = Object.keys(current).filter((k) => !(k in english));
  if (todo.length === 0 && stale.length === 0) {
    console.log(`  [skip] ${code}: up to date (${Object.keys(english).length} keys)`);
    return;
  }
  console.log(`  ${code}: ${todo.length} to translate, ${stale.length} stale to remove`);
  if (dryRun) {
    console.log(`    ${todo.slice(0, 10).join(', ')}${todo.length > 10 ? ', …' : ''}`);
    return;
  }

  for (const k of stale) { delete current[k]; delete sources[k]; }

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const keys = todo.slice(i, i + BATCH_SIZE);
    const batch = Object.fromEntries(keys.map((k) => [k, english[k]]));
    try {
      const raw = await provider.generateJSON(buildPrompt(name, code, batch), []);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const k of keys) {
        const value = parsed[k];
        if (typeof value !== 'string' || !value.trim()) {
          console.warn(`    [WARN] ${code}.${k}: no translation returned — left in English`);
          continue;
        }
        // A translation that lost or renamed a placeholder would render
        // "{name}" literally or drop a value; keep English instead.
        if (placeholdersOf(value).join(',') !== placeholdersOf(english[k]).join(',')) {
          console.warn(`    [WARN] ${code}.${k}: placeholders changed — left in English`);
          continue;
        }
        current[k] = value;
        sources[k] = hash(english[k]);
      }
    } catch (err) {
      console.warn(`    [ERR] ${code} batch ${i / BATCH_SIZE + 1}:`, err instanceof Error ? err.message : String(err));
    }
    // Write after every batch, so an interrupted run keeps what it paid for.
    writeJson(catalogPath, unflattenMessages(current));
    writeJson(sourcesPath, sources);
  }
}

async function main(): Promise<void> {
  await loadLanguageCatalog();
  const langFilter = parseArg('lang');
  const dryRun = process.argv.includes('--dry-run');

  const langs = NATIVE_LANGUAGES.filter((l) => l.code !== 'en' && (!langFilter || l.code === langFilter));
  if (langs.length === 0) {
    console.log('No matching native languages.');
    return;
  }

  let provider: AIProvider;
  try {
    provider = await getAIProvider();
  } catch (err) {
    console.error('Failed to construct an AI provider. Set AI_PROVIDER + its API key in the environment first.');
    console.error(String(err));
    process.exit(1);
  }

  console.log(`=== UI message translation${dryRun ? ' (dry run)' : ''} ===`);
  for (const lang of langs) await translateLanguage(provider, lang.code, lang.name, dryRun);
  console.log('=== Done. Review the diff in messages/ and commit it. ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Translation failed:', err);
  process.exit(1);
});
