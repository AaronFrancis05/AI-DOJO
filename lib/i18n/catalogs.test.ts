import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compareCatalogs, flattenMessages, type MessageTree } from './messages';

/**
 * The CI gate for UI translations (PLAN.md 2.4). Runs with `npm test`, so
 * the existing Test workflow enforces it.
 *
 * - every literal t('a.b') key in the code exists in messages/en.json;
 * - no catalog has a key en.json lacks (a stale or misspelt key);
 * - every translation keeps exactly English's {placeholders}.
 *
 * A key missing from a non-English catalog is NOT a failure — it renders in
 * English until `npm run i18n:translate` fills it.
 */

const ROOT = process.cwd();
const MESSAGES_DIR = join(ROOT, 'messages');
const english = JSON.parse(readFileSync(join(MESSAGES_DIR, 'en.json'), 'utf8')) as MessageTree;
const englishKeys = new Set(Object.keys(flattenMessages(english)));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

test('every t() key used in the code exists in messages/en.json', () => {
  const missing: string[] = [];
  // t('key') / t("key") / t(`key`) with a static key; dynamic keys
  // (t(item.labelKey)) are checked where their literals are declared, below.
  const call = /\bt\(\s*['"`]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"`]/g;
  const declared = /\b(?:labelKey|titleKey|messageKey):\s*['"`]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"`]/g;
  for (const dir of ['app', 'components', 'lib']) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8');
      for (const re of [call, declared]) {
        for (const m of text.matchAll(re)) {
          if (!englishKeys.has(m[1])) missing.push(`${m[1]}  (${file.slice(ROOT.length + 1)})`);
        }
      }
    }
  }
  assert.deepEqual(missing, [], `keys missing from messages/en.json:\n${missing.join('\n')}`);
});

test('no catalog has stray keys or broken placeholders', () => {
  const problems: string[] = [];
  for (const name of readdirSync(MESSAGES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
    const catalog = JSON.parse(readFileSync(join(MESSAGES_DIR, name), 'utf8')) as MessageTree;
    const { extra, placeholderMismatch } = compareCatalogs(english, catalog);
    for (const k of extra) problems.push(`${name}: ${k} is not in en.json`);
    for (const k of placeholderMismatch) problems.push(`${name}: ${k} has different {placeholders} from English`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
