'use client';

/* ───────────────────────────────────────────────
   Pieces every admin panel needs. Kept here rather than repeated per panel,
   and out of components/ui/ because none of it is general enough to be a
   design-system primitive.
   ─────────────────────────────────────────────── */

import { Card } from '@/components/ui/Card';
import { LoaderIcon } from '@/components/Icons';

export function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <LoaderIcon className="h-6 w-6 animate-spin text-dojo-accent" />
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-dashed border-dojo-border/60 py-16 text-center">
      <p className="text-sm text-dojo-text-muted">{children}</p>
    </Card>
  );
}

export const adminInputClass =
  'w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none';

/**
 * A failed admin call, carrying the body the route answered with.
 *
 * The delete guards in `/api/admin/curriculum/*` and `/api/admin/catalogue/*`
 * answer 409 with more than a message — `childCount` / `situationCount` say how
 * much would go with the node, and `archivable` says whether a `force` retry is
 * even on offer. `EntityTree` needs those to decide between "explain the
 * refusal" and "ask, then repeat the call with force", so the payload has to
 * survive the throw rather than being flattened to a string.
 */
export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/**
 * One JSON call to an admin endpoint, with the error the API actually gave.
 *
 * Every panel does the same thing on a write, and the part that is easy to get
 * wrong is the failure path: `res.json()` on an empty body throws, so a 500
 * would surface as "Unexpected end of JSON input" instead of anything useful.
 */
export async function adminFetch<T = unknown>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AdminApiError(
      (data && typeof data.error === 'string' && data.error) || `Request failed (${res.status})`,
      res.status,
      (data as Record<string, unknown> | null) ?? null,
    );
  }
  return data as T;
}
