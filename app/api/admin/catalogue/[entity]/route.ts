import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { domains, scenarios, situations } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { cacheDel, cacheKeys } from '@/lib/cache';

export const runtime = 'nodejs';

/**
 * The role-play catalogue: domains, their situations, and the scenarios a
 * session actually runs.
 *
 * Separate from `/api/admin/curriculum/*` because the foreign keys behave
 * differently, and that difference is the whole risk here:
 *
 *   domains → situations        ON DELETE cascade
 *   situations → scenarios      ON DELETE set null   (scenarios survive, orphaned)
 *   scenarios → sessions        **no action**        (Postgres refuses the delete)
 *
 * So deleting a domain quietly orphans scenarios rather than removing them,
 * and deleting a practised scenario raises a raw FK violation. Both are handled
 * explicitly below: archive is the default, delete is counted first, and the
 * FK error never reaches the client as a 500.
 */

const ENTITIES = {
  domains: {
    table: domains,
    label: 'domain',
    fields: ['slug', 'name', 'description', 'icon', 'heroGradientFrom', 'heroGradientTo', 'imageUrl', 'displayOrder', 'isActive'],
    parentColumn: null as string | null,
    archivable: true,
  },
  situations: {
    table: situations,
    label: 'situation',
    fields: ['title', 'context', 'skillLevel', 'behaviorMode', 'learningGoals', 'focusPills', 'displayOrder', 'isActive'],
    parentColumn: 'domainId',
    archivable: true,
  },
  scenarios: {
    table: scenarios,
    label: 'scenario',
    fields: ['title', 'context', 'businessType', 'difficulty', 'domain', 'aiCharacterName', 'aiCharacterRole', 'userCharacterName', 'userCharacterRole', 'learningGoals', 'displayOrder'],
    parentColumn: 'situationId',
    archivable: false,
  },
} as const;

type EntityKey = keyof typeof ENTITIES;

function specFor(entity: string) {
  return entity in ENTITIES ? ENTITIES[entity as EntityKey] : null;
}

/**
 * See the note in `/api/admin/curriculum/[entity]`: three tables in a union
 * narrow to their shared columns, and the real protection is the field
 * whitelist below, which is applied before anything reaches here.
 */
const writable = (values: Record<string, unknown>) => values as never;

function readFields(spec: { fields: readonly string[] }, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of spec.fields) {
    if (body[key] === undefined) continue;
    const value = body[key];
    if (typeof value === 'boolean' || typeof value === 'number') out[key] = value;
    else if (value === null) out[key] = null;
    else if (typeof value === 'string') out[key] = value.trim() || null;
  }
  return out;
}

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const spec = specFor((await params).entity);
  if (!spec) return Response.json({ error: 'Unknown catalogue entity' }, { status: 404 });

  const parentId = new URL(req.url).searchParams.get('parentId');
  const table = spec.table as unknown as Record<string, never>;
  const where =
    parentId && spec.parentColumn ? eq(table[spec.parentColumn], Number(parentId)) : undefined;

  const rows = await db.select().from(spec.table).where(where).orderBy(asc(table['displayOrder']));
  return Response.json({ success: true, rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const { entity } = await params;
  const spec = specFor(entity);
  if (!spec) return Response.json({ error: 'Unknown catalogue entity' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const values = readFields(spec, body as Record<string, unknown>);

  if (spec.parentColumn) {
    const parentId = Number(body[spec.parentColumn] ?? body.parentId);
    if (!Number.isInteger(parentId)) {
      return Response.json({ error: 'A parent is required' }, { status: 400 });
    }
    values[spec.parentColumn] = parentId;
  }

  try {
    const [created] = await db.insert(spec.table).values(writable(values)).returning();
    await invalidate(entity as EntityKey, Number((created as Record<string, unknown>).id));

    // `domains.situationCount` is denormalised and read by the hub listing, so
    // it has to be maintained here — nothing else recomputes it.
    if (entity === 'situations') await refreshSituationCount(Number(values.domainId));

    return Response.json({ success: true, row: created }, { status: 201 });
  } catch (err) {
    return catalogueError(err, spec.label);
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
  if (!spec) return Response.json({ error: 'Unknown catalogue entity' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ error: 'id is required' }, { status: 400 });

  const updates = readFields(spec, (body ?? {}) as Record<string, unknown>);
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const table = spec.table as unknown as Record<string, never>;

  try {
    const [updated] = await db
      .update(spec.table)
      .set(writable(updates))
      .where(eq(table['id'], id))
      .returning();
    if (!updated) return Response.json({ error: `${spec.label} not found` }, { status: 404 });

    await invalidate(entity as EntityKey, id);
    return Response.json({ success: true, row: updated });
  } catch (err) {
    return catalogueError(err, spec.label);
  }
}

/**
 * Deletes a catalogue node — but only when the FK graph makes that safe.
 *
 * Every refusal is a 409 that names the count, rather than letting Postgres'
 * own error surface as a 500. `app/api/bookings/route.ts` applies the same
 * discipline to SQLSTATE 23P01.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const { entity } = await params;
  const spec = specFor(entity);
  if (!spec) return Response.json({ error: 'Unknown catalogue entity' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return Response.json({ error: 'id is required' }, { status: 400 });

  const table = spec.table as unknown as Record<string, never>;
  const [existing] = await db.select().from(spec.table).where(eq(table['id'], id)).limit(1);
  if (!existing) return Response.json({ error: `${spec.label} not found` }, { status: 404 });

  if (entity === 'scenarios') {
    // The one case Postgres would refuse outright: `sessions.scenario_id` has
    // no ON DELETE, so a practised scenario cannot be removed at all. Say that,
    // with the number, instead of raising a 500 from the driver.
    const [{ sessionCount }] = await db
      .select({
        sessionCount: sql<number>`(select count(*)::int from sessions where scenario_id = ${id})`,
      })
      .from(scenarios)
      .limit(1);
    if (Number(sessionCount) > 0) {
      return Response.json(
        {
          error:
            `This scenario has been practised in ${sessionCount} session(s) and cannot be deleted — ` +
            `those sessions and their reports reference it. Detach it from its lessons instead.`,
        },
        { status: 409 },
      );
    }
  }

  if (entity === 'domains') {
    const [{ situationCount }] = await db
      .select({ situationCount: sql<number>`count(*)::int` })
      .from(situations)
      .where(eq(situations.domainId, id));

    if (Number(situationCount) > 0 && body?.force !== true) {
      return Response.json(
        {
          error:
            `This domain has ${situationCount} situation(s). Deleting it removes them, and the ` +
            `scenarios beneath them are left orphaned rather than deleted — they keep working in ` +
            `existing sessions but disappear from the hub. Archive it instead, or confirm to delete anyway.`,
          situationCount,
          archivable: true,
        },
        { status: 409 },
      );
    }
  }

  const domainId = (existing as Record<string, unknown>).domainId;

  try {
    await db.delete(spec.table).where(eq(table['id'], id));
  } catch (err) {
    return catalogueError(err, spec.label);
  }

  await invalidate(entity as EntityKey, id);
  if (entity === 'situations' && typeof domainId === 'number') {
    await refreshSituationCount(domainId);
  }

  return Response.json({ success: true });
}

/* ── helpers ─────────────────────────────────────────────────────────── */

/** Keeps `domains.situationCount` — read on every hub listing — truthful. */
async function refreshSituationCount(domainId: number) {
  if (!Number.isInteger(domainId)) return;
  await db
    .update(domains)
    .set({
      situationCount: sql`(select count(*)::int from situations where domain_id = ${domainId} and is_active = true)`,
    })
    .where(eq(domains.id, domainId));
  await cacheDel(cacheKeys.domain(domainId));
}

/**
 * Drops the cached copy of whatever was written.
 *
 * These rows are cached for an hour (`TTL.DOMAIN` / `TTL.SITUATION` /
 * `TTL.SCENARIO`, all 3600) on the assumption in `lib/cache.ts` that
 * "scenarios never change". Now that an admin can change them, an edit that
 * did not invalidate would appear to do nothing for an hour.
 */
async function invalidate(entity: EntityKey, id: number) {
  if (!Number.isInteger(id)) return;
  if (entity === 'domains') await cacheDel(cacheKeys.domain(id));
  else if (entity === 'situations') await cacheDel(cacheKeys.situation(id));
  else if (entity === 'scenarios') await cacheDel(cacheKeys.scenario(id));
}

function catalogueError(err: unknown, label: string): Response {
  const code = (err as { code?: string })?.code;
  if (code === '23505') {
    return Response.json({ error: `Another ${label} already uses that slug.` }, { status: 409 });
  }
  if (code === '23503') {
    return Response.json(
      { error: `That ${label} is still referenced by something else.` },
      { status: 409 },
    );
  }
  throw err;
}
