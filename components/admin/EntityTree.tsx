'use client';

/* ───────────────────────────────────────────────
   EntityTree — the drill-down editor both content tabs are built from.

   `courses → levels → units → lessons → phases` and
   `domains → situations → scenarios` are the same interaction: pick a node,
   walk into its children, add/rename/reorder/archive/delete one. The two
   routes behind them (`/api/admin/curriculum/[entity]`,
   `/api/admin/catalogue/[entity]`) are already one implementation each over a
   validated path segment, so the console matches that shape rather than
   growing eight near-identical panels that would drift.

   The field descriptors below are presentation only — labels, widgets, the
   choices in a select. What may actually be written is decided server-side by
   `readEntityFields` / `readFields`, which whitelist against the real column
   list; nothing here can widen that.
   ─────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import {
  AdminApiError,
  EmptyState,
  Loading,
  adminFetch,
  adminInputClass,
} from '@/components/admin/shared';
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';

export interface AdminField {
  key: string;
  label: string;
  widget?: 'text' | 'textarea' | 'number' | 'select' | 'boolean';
  options?: readonly string[];
  hint?: string;
  /** Holds the create button until it is filled. The route validates as well. */
  required?: boolean;
  /** An empty value clears the column instead of being left alone. */
  nullable?: boolean;
}

export interface TreeLevel {
  /** Path segment under `basePath`. */
  entity: string;
  /** Singular, lower case — used in prose ("Add a level"). */
  label: string;
  /** Plural, title case — the breadcrumb and heading. */
  plural: string;
  /** The column holding the row's display name. */
  titleKey?: string;
  fields: AdminField[];
  /** The route accepts `{ move: 'up' | 'down' }` for this entity. */
  reorderable?: boolean;
  /** Rows carry `isActive`, so archiving is offered as well as deleting. */
  archivable?: boolean;
}

type Row = Record<string, unknown> & { id: number };

type FormValues = Record<string, string | boolean>;

export function EntityTree({
  basePath,
  levels,
  onError,
}: {
  basePath: string;
  levels: TreeLevel[];
  onError: (msg: string) => void;
}) {
  /** The chain of ancestors that has been walked into. Depth is its length. */
  const [path, setPath] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const depth = path.length;
  const level = levels[depth];
  const childLevel = levels[depth + 1];
  const parentId = depth > 0 ? path[depth - 1].id : null;

  useEffect(() => {
    let cancelled = false;

    const query = parentId === null ? '' : `?parentId=${parentId}`;
    adminFetch<{ rows: Row[] }>(`${basePath}/${level.entity}${query}`)
      .then((data) => { if (!cancelled) setRows(data.rows ?? []); })
      .catch((e) => {
        if (!cancelled) onError(e instanceof Error ? e.message : `Failed to load ${level.plural}`);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [basePath, level.entity, level.plural, parentId, reloadKey, onError]);

  /**
   * Both ways the listing changes underneath us, with the open forms closed.
   *
   * Done here rather than in the loader effect: a synchronous setState inside
   * an effect body cascades a second render for every one of these, and the two
   * callers are already events.
   */
  const enterLoading = useCallback(() => {
    setEditingId(null);
    setAdding(false);
    setLoading(true);
  }, []);

  const reload = useCallback(() => {
    enterLoading();
    setReloadKey((n) => n + 1);
  }, [enterLoading]);

  const goTo = useCallback((next: Row[]) => {
    enterLoading();
    setPath(next);
  }, [enterLoading]);

  const write = useCallback(
    async (id: number | null, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
      setBusyId(id ?? -1);
      onError('');
      try {
        await adminFetch(`${basePath}/${level.entity}`, { method, body });
        reload();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setBusyId(null);
      }
    },
    [basePath, level.entity, onError, reload],
  );

  /**
   * Deletes a node, escalating only when the route says a `force` retry is on
   * offer. A 409 that does not carry `archivable` is a hard refusal — a
   * practised scenario, a unique-key clash — and repeating it with `force`
   * would just fail again, so it is reported instead.
   */
  const remove = useCallback(
    async (row: Row) => {
      const title = titleOf(row, level);
      if (!window.confirm(`Delete the ${level.label} "${title}"?`)) return;

      setBusyId(row.id);
      onError('');
      try {
        await adminFetch(`${basePath}/${level.entity}`, { method: 'DELETE', body: { id: row.id } });
        reload();
      } catch (e) {
        const forceable =
          e instanceof AdminApiError && e.status === 409 && e.data !== null && 'archivable' in e.data;

        if (forceable && window.confirm(`${(e as AdminApiError).message}\n\nDelete it anyway?`)) {
          try {
            await adminFetch(`${basePath}/${level.entity}`, {
              method: 'DELETE',
              body: { id: row.id, force: true },
            });
            reload();
          } catch (inner) {
            onError(inner instanceof Error ? inner.message : 'Delete failed');
          }
        } else if (!forceable) {
          onError(e instanceof Error ? e.message : 'Delete failed');
        }
      } finally {
        setBusyId(null);
      }
    },
    [basePath, level, onError, reload],
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb levels={levels} path={path} onNavigate={goTo} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-dojo-text-primary">
          {level.plural}
          {depth > 0 && (
            <span className="ml-2 text-sm font-normal text-dojo-text-muted">
              in “{titleOf(path[depth - 1], levels[depth - 1])}”
            </span>
          )}
        </h2>
        <Button variant="secondary" size="sm" onClick={() => { setAdding((v) => !v); setEditingId(null); }}>
          <Plus className="h-3.5 w-3.5" />
          {adding ? 'Cancel' : `Add ${level.label}`}
        </Button>
      </div>

      {adding && (
        <RowForm
          level={level}
          saving={busyId === -1}
          onCancel={() => setAdding(false)}
          onSubmit={(body) =>
            write(null, 'POST', parentId === null ? body : { ...body, parentId })
          }
        />
      )}

      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState>
          No {level.plural.toLowerCase()} here yet.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <Card key={row.id} raised className="!p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-dojo-text-primary">
                      {titleOf(row, level)}
                    </span>
                    {level.archivable && row.isActive === false && (
                      <Badge variant="outline">archived</Badge>
                    )}
                    {typeof row.slug === 'string' && (
                      <span className="font-mono text-xs text-dojo-text-muted">{row.slug}</span>
                    )}
                  </div>
                  <RowSummary row={row} level={level} />
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {level.reorderable && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Move ${titleOf(row, level)} up`}
                        disabled={busyId === row.id || index === 0}
                        onClick={() => write(row.id, 'PATCH', { id: row.id, move: 'up' })}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Move ${titleOf(row, level)} down`}
                        disabled={busyId === row.id || index === rows.length - 1}
                        onClick={() => write(row.id, 'PATCH', { id: row.id, move: 'down' })}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditingId(editingId === row.id ? null : row.id); setAdding(false); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {editingId === row.id ? 'Cancel' : 'Edit'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={`Delete ${titleOf(row, level)}`}
                    disabled={busyId === row.id}
                    onClick={() => remove(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {childLevel && (
                    <Button size="sm" variant="secondary" onClick={() => goTo([...path, row])}>
                      {childLevel.plural}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {level.archivable && (
                <div className="mt-4 border-t border-dojo-border pt-4">
                  <Toggle
                    enabled={row.isActive !== false}
                    onChange={(next) => write(row.id, 'PATCH', { id: row.id, isActive: next })}
                    label="Published"
                    description={
                      busyId === row.id ? 'Saving…' : `Visible to learners. Archiving keeps the ${level.label} and everything under it.`
                    }
                  />
                </div>
              )}

              {editingId === row.id && (
                <RowForm
                  level={level}
                  row={row}
                  saving={busyId === row.id}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(body) => write(row.id, 'PATCH', { id: row.id, ...body })}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function titleOf(row: Row, level: TreeLevel): string {
  const value = row[level.titleKey ?? 'title'];
  return typeof value === 'string' && value ? value : `#${row.id}`;
}

function Breadcrumb({
  levels,
  path,
  onNavigate,
}: {
  levels: TreeLevel[];
  path: Row[];
  onNavigate: (next: Row[]) => void;
}) {
  if (path.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate([])}
        className="rounded-(--radius-md) px-2 py-1 text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
      >
        {levels[0].plural}
      </button>
      {path.map((row, i) => (
        <span key={row.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-dojo-text-muted" />
          <button
            type="button"
            onClick={() => onNavigate(path.slice(0, i + 1))}
            className={
              i === path.length - 1
                ? 'rounded-(--radius-md) px-2 py-1 font-medium text-dojo-text-primary'
                : 'rounded-(--radius-md) px-2 py-1 text-dojo-text-muted transition-colors hover:text-dojo-text-primary'
            }
          >
            {titleOf(row, levels[i])}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** The one-line-per-field digest under a row's title. */
function RowSummary({ row, level }: { row: Row; level: TreeLevel }) {
  const long = level.fields.find(
    (f) => f.widget === 'textarea' && typeof row[f.key] === 'string' && row[f.key],
  );
  const chips = level.fields.filter(
    (f) =>
      f.widget !== 'textarea' &&
      f.widget !== 'boolean' &&
      f.key !== (level.titleKey ?? 'title') &&
      f.key !== 'slug' &&
      row[f.key] !== null &&
      row[f.key] !== undefined &&
      row[f.key] !== '',
  );

  return (
    <>
      {long && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-dojo-text-muted">
          {String(row[long.key])}
        </p>
      )}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dojo-text-muted">
          {chips.map((f) => (
            <span key={f.key}>
              {f.label}: {String(row[f.key])}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Create/edit form for one node.
 *
 * A blank optional value is *omitted* rather than sent, because both routes
 * read a number through `Number()` — an empty string would arrive as 0 and
 * silently rewrite a sequence position. Fields marked `nullable` are the
 * exception: there, blank is the way to clear the column.
 */
function RowForm({
  level,
  row,
  saving,
  onCancel,
  onSubmit,
}: {
  level: TreeLevel;
  row?: Row;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  // Seeded once: the form is unmounted on every successful write (the loader
  // effect clears `editingId`), so there is no stale-props case to sync.
  const [values, setValues] = useState<FormValues>(() => {
    const out: FormValues = {};
    for (const field of level.fields) {
      const value = row?.[field.key];
      out[field.key] =
        field.widget === 'boolean'
          ? value === true
          : value === null || value === undefined
            ? ''
            : String(value);
    }
    return out;
  });

  const set = (key: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const missing = level.fields.filter(
    (f) => f.required && typeof values[f.key] === 'string' && !(values[f.key] as string).trim(),
  );

  const submit = () => {
    const body: Record<string, unknown> = {};
    for (const field of level.fields) {
      const value = values[field.key];

      if (field.widget === 'boolean') {
        body[field.key] = value === true;
        continue;
      }

      const text = String(value).trim();
      if (!text) {
        if (field.nullable) body[field.key] = null;
        continue;
      }

      body[field.key] = field.widget === 'number' ? Number(text) : text;
    }
    onSubmit(body);
  };

  const id = (key: string) => `${level.entity}-${row?.id ?? 'new'}-${key}`;

  return (
    <div className={row ? 'mt-6 border-t border-dojo-border pt-6' : 'rounded-(--radius-md) border border-dojo-border bg-dojo-surface-raised p-5'}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {level.fields.map((field) => (
          <div
            key={field.key}
            className={field.widget === 'textarea' ? 'sm:col-span-2' : undefined}
          >
            {field.widget === 'boolean' ? (
              <Toggle
                enabled={values[field.key] === true}
                onChange={(next) => set(field.key, next)}
                label={field.label}
                description={field.hint}
              />
            ) : (
              <>
                <label htmlFor={id(field.key)} className="mb-2 block text-sm text-dojo-text-primary">
                  {field.label}
                  {field.required && <span className="ml-1 text-dojo-danger">*</span>}
                </label>
                {field.widget === 'textarea' ? (
                  <textarea
                    id={id(field.key)}
                    rows={3}
                    value={String(values[field.key])}
                    onChange={(e) => set(field.key, e.target.value)}
                    className={`${adminInputClass} resize-y leading-relaxed`}
                  />
                ) : field.widget === 'select' ? (
                  <select
                    id={id(field.key)}
                    value={String(values[field.key])}
                    onChange={(e) => set(field.key, e.target.value)}
                    className={adminInputClass}
                  >
                    <option value="">—</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id(field.key)}
                    type={field.widget === 'number' ? 'number' : 'text'}
                    value={String(values[field.key])}
                    onChange={(e) => set(field.key, e.target.value)}
                    className={adminInputClass}
                  />
                )}
                {field.hint && (
                  <p className="mt-1.5 text-xs leading-relaxed text-dojo-text-muted">{field.hint}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          variant="primary"
          loading={saving}
          disabled={saving || missing.length > 0}
          onClick={submit}
        >
          {row ? 'Save changes' : `Create ${level.label}`}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
