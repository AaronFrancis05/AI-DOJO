/**
 * Message catalogs and the translate function. Pure — shared by server
 * components, the client `useT()` hook, the translation script and the CI
 * key check.
 *
 * Catalogs live in `messages/<lang>.json`; `en.json` is the source of truth.
 * Keys are dotted paths into nested objects ("nav.home"). Values may contain
 * `{name}` placeholders, filled from the vars argument.
 */

export interface MessageTree {
  [key: string]: string | MessageTree;
}

export type TranslationVars = Record<string, string | number>;
export type Translate = (key: string, vars?: TranslationVars) => string;

function lookup(tree: MessageTree, key: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const part of key.split('.')) {
    if (node == null || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Replaces `{name}` with vars.name; an unknown placeholder is left visible. */
export function formatMessage(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}

/**
 * A translator over a merged catalog (see mergeMessages). A key missing even
 * from English is a bug, so it renders as the key itself — visible in QA,
 * never a blank button.
 */
export function createTranslator(messages: MessageTree): Translate {
  return (key, vars) => formatMessage(lookup(messages, key) ?? key, vars);
}

/**
 * Overlays a locale's catalog on English, key by key, so a partly translated
 * locale shows English only for the strings it is missing — never a mix of
 * structure. Only string leaves present in `base` survive: a stale key the
 * English catalog no longer has is dropped rather than shipped.
 */
export function mergeMessages(base: MessageTree, overlay: MessageTree | null | undefined): MessageTree {
  if (!overlay) return base;
  const out: MessageTree = {};
  for (const [key, value] of Object.entries(base)) {
    const over = overlay[key];
    if (typeof value === 'string') {
      out[key] = typeof over === 'string' && over.length > 0 ? over : value;
    } else {
      out[key] = mergeMessages(value, over && typeof over === 'object' ? over : undefined);
    }
  }
  return out;
}

/** `{ "nav.home": "Home", ... }` — the shape the translation script and CI check compare. */
export function flattenMessages(tree: MessageTree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flattenMessages(value, path));
  }
  return out;
}

/** Inverse of flattenMessages. */
export function unflattenMessages(flat: Record<string, string>): MessageTree {
  const out: MessageTree = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = out;
    for (const part of parts.slice(0, -1)) {
      const next = node[part];
      if (typeof next === 'object') {
        node = next;
      } else {
        const created: MessageTree = {};
        node[part] = created;
        node = created;
      }
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

/** The `{name}` placeholders in a template, sorted — a translation must keep exactly these. */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

export interface CatalogProblems {
  /** In en.json but not in the locale (allowed while a translation is pending, reported). */
  missing: string[];
  /** In the locale but not in en.json — always an error. */
  extra: string[];
  /** Placeholders differ from English — always an error, it would render `{name}` or drop a value. */
  placeholderMismatch: string[];
}

export function compareCatalogs(english: MessageTree, locale: MessageTree): CatalogProblems {
  const en = flattenMessages(english);
  const other = flattenMessages(locale);
  const missing = Object.keys(en).filter((k) => !(k in other));
  const extra = Object.keys(other).filter((k) => !(k in en));
  const placeholderMismatch = Object.keys(other).filter((k) =>
    k in en && placeholdersOf(en[k]).join(',') !== placeholdersOf(other[k]).join(','));
  return { missing, extra, placeholderMismatch };
}
