/**
 * Organization tutor permissions, the database half of `tutor-rules`.
 *
 * Creation paths call `learnerMayUseTutor`. Joining a session that already
 * exists calls `tutorMayHoldSessionById` and does not read this table.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  organizationTutorPermissions,
  tutors,
  users,
} from '@/src/schema';
import { toUserRole } from '@/lib/auth/roles';
import { parseLanguageCodes } from '@/lib/tutors/languages';
import { loadMembership, OrganizationError } from './membership';
import {
  mayBrowseTutors,
  mayDiscoverTutor,
  mayStartWithTutor,
  tutorMayHoldSession,
  type LearnerTutorScope,
} from './tutor-rules';

export const TUTOR_NOT_AVAILABLE = 'This tutor is not available.';
export const SESSION_NOT_AVAILABLE = 'This session is not available.';

export interface TutorAccess {
  unrestricted: boolean;
  isDefault: boolean | null;
  /** Set only for a private organization. */
  permittedIds: Set<number> | null;
}

export async function loadTutorAccess(userId: string): Promise<TutorAccess> {
  const [account] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (toUserRole(account?.role) === 'admin') {
    return { unrestricted: true, isDefault: null, permittedIds: null };
  }

  const membership = await loadMembership(userId);
  if (!membership || membership.status !== 'active') {
    return { unrestricted: false, isDefault: null, permittedIds: null };
  }
  if (membership.isDefault) {
    return { unrestricted: false, isDefault: true, permittedIds: null };
  }

  const rows = await db
    .select({ tutorId: organizationTutorPermissions.tutorId })
    .from(organizationTutorPermissions)
    .where(eq(organizationTutorPermissions.organizationId, membership.organizationId));
  return {
    unrestricted: false,
    isDefault: false,
    permittedIds: new Set(rows.map((row) => row.tutorId)),
  };
}

function scopeOf(access: TutorAccess): LearnerTutorScope {
  return { unrestricted: access.unrestricted, isDefault: access.isDefault };
}

/** List filter. `bookable` is verified, accepting, and an active account. */
export function mayDiscoverWithAccess(
  access: TutorAccess,
  tutorId: number,
  bookable: boolean,
  committed: boolean,
): boolean {
  return mayDiscoverTutor(scopeOf(access), {
    verified: bookable,
    accepting: bookable,
    accountActive: bookable,
    permitted: access.permittedIds?.has(tutorId) ?? false,
  }, committed);
}

export async function learnerMayUseTutor(userId: string, tutorId: number): Promise<boolean> {
  const access = await loadTutorAccess(userId);
  const [tutor] = await db
    .select({
      verificationStatus: tutors.verificationStatus,
      isAcceptingBookings: tutors.isAcceptingBookings,
      accountStatus: users.status,
    })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(eq(tutors.id, tutorId))
    .limit(1);
  if (!tutor) return false;
  return mayStartWithTutor(scopeOf(access), {
    verified: tutor.verificationStatus === 'verified',
    accepting: tutor.isAcceptingBookings,
    accountActive: tutor.accountStatus === 'active',
    permitted: access.permittedIds?.has(tutorId) ?? false,
  });
}

export function tutorUnavailableResponse(): Response {
  return Response.json({ error: TUTOR_NOT_AVAILABLE }, { status: 404 });
}

/** Null when the session may still be entered. */
export async function tutorHoldBlock(tutorId: number): Promise<Response | null> {
  const [tutor] = await db
    .select({
      verificationStatus: tutors.verificationStatus,
      accountStatus: users.status,
    })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(eq(tutors.id, tutorId))
    .limit(1);
  if (!tutor || !tutorMayHoldSession(tutor)) {
    return Response.json({ error: SESSION_NOT_AVAILABLE }, { status: 403 });
  }
  return null;
}

async function countBookable(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(and(
      eq(tutors.verificationStatus, 'verified'),
      eq(tutors.isAcceptingBookings, true),
      eq(users.status, 'active'),
    ));
  return Number(row?.n ?? 0);
}

async function countPermittedBookable(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(and(
      eq(tutors.verificationStatus, 'verified'),
      eq(tutors.isAcceptingBookings, true),
      eq(users.status, 'active'),
      inArray(tutors.id, ids),
    ));
  return Number(row?.n ?? 0);
}

/** Whether a learner's Tutors menu has anyone to show. Admins are decided by the caller. */
export async function learnerHasBookableTutor(userId: string): Promise<boolean> {
  const access = await loadTutorAccess(userId);
  let bookableCount = 0;
  if (access.isDefault === true) bookableCount = await countBookable();
  else if (access.isDefault === false) bookableCount = await countPermittedBookable([...(access.permittedIds ?? [])]);
  return mayBrowseTutors({ role: 'learner', scope: scopeOf(access), bookableCount });
}

export interface OrganizationTutorCard {
  id: number;
  name: string;
  headline: string;
  languages: string[];
  instructionLanguages: string[];
  hourlyRateCents: number;
  currency: string;
  bookable: boolean;
}

function toCard(row: {
  id: number;
  name: string;
  headline: string;
  languages: string;
  instructionLanguages: string | null;
  hourlyRateCents: number;
  currency: string;
  verificationStatus: string;
  isAcceptingBookings: boolean;
  accountStatus: string;
}): OrganizationTutorCard {
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    languages: parseLanguageCodes(row.languages),
    instructionLanguages: parseLanguageCodes(row.instructionLanguages),
    hourlyRateCents: row.hourlyRateCents,
    currency: row.currency,
    bookable: row.verificationStatus === 'verified' && row.isAcceptingBookings && row.accountStatus === 'active',
  };
}

const cardColumns = {
  id: tutors.id,
  name: users.name,
  headline: tutors.headline,
  languages: tutors.languages,
  instructionLanguages: tutors.instructionLanguages,
  hourlyRateCents: tutors.hourlyRateCents,
  currency: tutors.currency,
  verificationStatus: tutors.verificationStatus,
  isAcceptingBookings: tutors.isAcceptingBookings,
  accountStatus: users.status,
};

export async function listOrganizationTutorPermissions(organizationId: number): Promise<{
  allowed: OrganizationTutorCard[];
  available: OrganizationTutorCard[];
}> {
  const [allowedRows, catalogueRows] = await Promise.all([
    db
      .select(cardColumns)
      .from(organizationTutorPermissions)
      .innerJoin(tutors, eq(organizationTutorPermissions.tutorId, tutors.id))
      .innerJoin(users, eq(tutors.userId, users.id))
      .where(eq(organizationTutorPermissions.organizationId, organizationId))
      .orderBy(users.name),
    db
      .select(cardColumns)
      .from(tutors)
      .innerJoin(users, eq(tutors.userId, users.id))
      .where(and(
        eq(tutors.verificationStatus, 'verified'),
        eq(tutors.isAcceptingBookings, true),
        eq(users.status, 'active'),
      ))
      .orderBy(users.name),
  ]);

  const allowed = allowedRows.map(toCard);
  const allowedIds = new Set(allowed.map((tutor) => tutor.id));
  return {
    allowed,
    available: catalogueRows.map(toCard).filter((tutor) => !allowedIds.has(tutor.id)),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  return (err as { code?: string } | null)?.code === '23505' || cause?.code === '23505';
}

export async function grantOrganizationTutor(organizationId: number, tutorId: number): Promise<void> {
  const allowed = await db
    .select({ id: tutors.id })
    .from(tutors)
    .innerJoin(users, eq(tutors.userId, users.id))
    .where(and(
      eq(tutors.id, tutorId),
      eq(tutors.verificationStatus, 'verified'),
      eq(tutors.isAcceptingBookings, true),
      eq(users.status, 'active'),
    ))
    .limit(1);
  if (allowed.length === 0) throw new OrganizationError(404, 'Not found');

  try {
    await db.insert(organizationTutorPermissions).values({ organizationId, tutorId });
  } catch (err) {
    if (isUniqueViolation(err)) throw new OrganizationError(409, 'This tutor is already allowed.');
    throw err;
  }
}

export async function revokeOrganizationTutor(organizationId: number, tutorId: number): Promise<void> {
  const removed = await db
    .delete(organizationTutorPermissions)
    .where(and(
      eq(organizationTutorPermissions.organizationId, organizationId),
      eq(organizationTutorPermissions.tutorId, tutorId),
    ))
    .returning({ id: organizationTutorPermissions.id });
  if (removed.length === 0) throw new OrganizationError(404, 'Not found');
}
