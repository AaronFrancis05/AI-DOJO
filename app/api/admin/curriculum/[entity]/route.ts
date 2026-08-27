import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { dbPool } from '@/src/db-pool';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import {
  ENTITY_SPECS,
  isCurriculumEntity,
  readEntityFields,
  type CurriculumEntity,
} from '@/lib/admin/curriculum';

export const runtime = 'nodejs';

/**
 * CRUD over the curriculum tree — `courses`, `levels`, `units`, `lessons`,
 * `phases` — driven by `lib/admin/curriculum.ts`.
 *
 * One implementation over a validated path segment rather than five route
 * files: the five tables differ only in their columns and their parent, and
 * five copies of the same reorder-and-archive logic would drift.
 *
 * `?parentId=` filters a listing to one parent, which is how the console walks
 * the tree a level at a time.
 */
function specFor(entity: string) {
  return isCurriculumEntity(entity) ? ENTITY_SPECS[entity as CurriculumEntity] : null;
}

/**
 * The one place this file leaves Drizzle's types.
 *
 * `spec.table` is a union of five tables, and Drizzle narrows an insert or
 * update against a union to the columns they all share — which is `id`,
 * `title` and `createdAt`. Writing `sequenceOrder` is then a type error even
 * though four of the five tables have it.
 *
 * The safety this gives up is already provided earlier and better:
 * `readEntityFields` whitelists keys against `spec.fields`, so nothing reaches
 * here that the target table does not declare, and a caller cannot smuggle in
 * `id`. Postgres rejects anything that slips past that. Isolated in one helper
 * so the cast is not repeated at five call sites where it would stop being
 * obviously safe.
 */
type WritableRow = Record<string, unknown>;
const writable = (values: WritableRow) => values as never;

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const { entity } = await params;
  const spec = specFor(entity);
  if (!spec) return Response.json({ error: 'Unknown curriculum entity' }, { status: 404 });

  const parentId = new URL(req.url).searchParams.get('parentId');

  const table = spec.table as unknown as Record<string, never>;
  const where =
    parentId && spec.parentColumn
      ? eq(table[spec.parentColumn], Number(parentId))
      : undefined;

  // Ordered the way the curriculum is walked: by sequence where there is one,
  // otherwise by display order. The learner-facing pages assume the same order.
  const orderColumn = 'sequenceOrder' in spec.fields ? table['sequenceOrder'] : table['displayOrder'];

  const rows = await db.select().from(spec.table).where(where).orderBy(asc(orderColumn));

  return Response.json({ success: true, entity, rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const { entity } = await params;
  const spec = specFor(entity);
  if (!spec) return Response.json({ error: 'Unknown curriculum entity' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const values = readEntityFields(spec, body as Record<string, unknown>);

  if (spec.parentColumn) {
    const parentId = Number(body[spec.parentColumn] ?? body.parentId);
    if (!Number.isInteger(parentId)) {
      return Response.json({ error: `A parent ${spec.label} is required` }, { status: 400 });
    }
    values[spec.parentColumn] = parentId;
  }

  if (!values.title && spec.fields.title) {
    return Response.json({ error: 'A title is required' }, { status: 400 });
  }

  // `sequenceOrder` is half of a unique index with the parent, so an omitted
  // one has to be computed rather than defaulted to 0 — which would collide
  // with the first sibling and fail on the second insert.
  if (spec.fields.sequenceOrder && values.sequenceOrder === undefined) {
    values.sequenceOrder = await nextSequence(spec, Number(values[spec.parentColumn!]));
  }

  try {
    const [created] = await db.insert(spec.table).values(writable(values)).returning();
    return Response.json({ success: true, row: created }, { status: 201 });
  } catch (err) {
    return conflictResponse(err, spec.label);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const { entity } = await params;
  const spec = specFor(entity);
  if (!spec) return Response.json({ error: 'Unknown curriculum entity' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ error: 'id is required' }, { status: 400 });

  const table = spec.table as unknown as Record<string, never>;

  // Reordering is its own operation, in a transaction: `sequenceOrder` is
  // unique per parent, so swapping two siblings by writing one then the other
  // collides on the first write. Moving through a free slot avoids needing to
  // drop the constraint.
  if (body.move === 'up' || body.move === 'down') {
    if (!spec.fields.sequenceOrder || !spec.parentColumn) {
      return Response.json({ error: `A ${spec.label} cannot be reordered` }, { status: 400 });
    }
    return reorder(spec, id, body.move);
  }

  const updates = readEntityFields(spec, (body ?? {}) as Record<string, unknown>);
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(spec.table)
      .set(writable(updates))
      .where(eq(table['id'], id))
      .returning();
    if (!updated) return Response.json({ error: `${spec.label} not found` }, { status: 404 });
    return Response.json({ success: true, row: updated });
  } catch (err) {
    return conflictResponse(err, spec.label);
  }
}

/**
 * Deletes a node, after counting what would go with it.
 *
 * The whole chain is `ON DELETE cascade`, so removing a course silently takes
 * its levels, units, lessons and phases — and the learners' progress rows
 * against those lessons. That is a legitimate action for a mistyped draft and
 * a catastrophic one for a live course, and the difference is invisible from
 * the button. So: an archivable entity refuses a delete unless `force` is set,
 * and every response says what the count was.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const { entity } = await params;
  const spec = specFor(entity);
  if (!spec) return Response.json({ error: 'Unknown curriculum entity' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ error: 'id is required' }, { status: 400 });

  const table = spec.table as unknown as Record<string, never>;

  const [existing] = await db.select().from(spec.table).where(eq(table['id'], id)).limit(1);
  if (!existing) return Response.json({ error: `${spec.label} not found` }, { status: 404 });

  let childCount = 0;
  if (spec.child) {
    const childSpec = ENTITY_SPECS[spec.child];
    const childTable = childSpec.table as unknown as Record<string, never>;
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(childSpec.table)
      .where(eq(childTable[childSpec.parentColumn!], id));
    childCount = Number(n);
  }

  if (childCount > 0 && body?.force !== true) {
    return Response.json(
      {
        error:
          `This ${spec.label} still has ${childCount} ${ENTITY_SPECS[spec.child!].label}(s), and ` +
          `deleting it removes them and every learner's progress through them.` +
          (spec.archivable ? ' Archive it instead, or confirm to delete anyway.' : ' Confirm to delete anyway.'),
        childCount,
        archivable: spec.archivable,
      },
      { status: 409 },
    );
  }

  await db.delete(spec.table).where(eq(table['id'], id));
  return Response.json({ success: true, deletedChildren: childCount });
}

/* ── helpers ─────────────────────────────────────────────────────────── */

async function nextSequence(spec: (typeof ENTITY_SPECS)[CurriculumEntity], parentId: number) {
  const table = spec.table as unknown as Record<string, never>;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(sequence_order), 0)` })
    .from(spec.table)
    .where(eq(table[spec.parentColumn!], parentId));
  return Number(max) + 1;
}

async function reorder(
  spec: (typeof ENTITY_SPECS)[CurriculumEntity],
  id: number,
  direction: 'up' | 'down',
) {
  const table = spec.table as unknown as Record<string, never>;

  return dbPool.transaction(async (tx) => {
    const [row] = await tx.select().from(spec.table).where(eq(table['id'], id)).limit(1);
    if (!row) return Response.json({ error: `${spec.label} not found` }, { status: 404 });

    const current = Number((row as Record<string, unknown>).sequenceOrder);
    const parentId = (row as Record<string, unknown>)[spec.parentColumn!];

    const siblings = await tx
      .select()
      .from(spec.table)
      .where(eq(table[spec.parentColumn!], parentId as never))
      .orderBy(asc(table['sequenceOrder']));

    const index = siblings.findIndex((s) => Number((s as Record<string, unknown>).id) === id);
    const swapWith = direction === 'up' ? siblings[index - 1] : siblings[index + 1];
    if (!swapWith) return Response.json({ success: true, moved: false });

    const otherId = Number((swapWith as Record<string, unknown>).id);
    const otherOrder = Number((swapWith as Record<string, unknown>).sequenceOrder);

    // Through a free slot, because (parent, sequenceOrder) is unique: writing
    // this row's target value directly would collide with the sibling that
    // still holds it.
    const [{ parking }] = await tx
      .select({ parking: sql<number>`coalesce(max(sequence_order), 0) + 1` })
      .from(spec.table)
      .where(eq(table[spec.parentColumn!], parentId as never));

    await tx.update(spec.table).set(writable({ sequenceOrder: Number(parking) })).where(eq(table['id'], id));
    await tx.update(spec.table).set(writable({ sequenceOrder: current })).where(eq(table['id'], otherId));
    await tx.update(spec.table).set(writable({ sequenceOrder: otherOrder })).where(eq(table['id'], id));

    return Response.json({ success: true, moved: true });
  });
}

/** Turns Postgres' unique/FK violations into something an admin can act on. */
function conflictResponse(err: unknown, label: string): Response {
  const code = (err as { code?: string })?.code;
  if (code === '23505') {
    return Response.json(
      { error: `Another ${label} already uses that position or slug.` },
      { status: 409 },
    );
  }
  if (code === '23503') {
    return Response.json({ error: `That parent ${label} does not exist.` }, { status: 400 });
  }
  throw err;
}
