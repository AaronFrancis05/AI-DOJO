/**
 * Organization membership: the one place a learner is placed, retired, or moved.
 *
 * Neon’s HTTP driver does not run a multi-statement transaction, so each
 * change is ordered so a retry finishes the job. Group rows are cleared
 * before the membership row moves, and an invitation is marked only after
 * the membership write succeeds.
 */

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  courses,
  groupMemberships,
  groups,
  organizationInvitations,
  organizationMemberships,
  organizations,
  studentProgress,
  users,
} from '@/src/schema';
import {
  PUBLIC_ORG_NAME,
  PUBLIC_ORG_SLUG,
  inviteBlock,
  inviteErrorMessage,
  isValidEmail,
  isValidSlug,
  normalizeEmail,
} from './rules';

export class OrganizationError extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'OrganizationError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  return (err as { code?: string } | null)?.code === '23505' || cause?.code === '23505';
}

export async function ensurePublicOrganization(): Promise<number> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, PUBLIC_ORG_SLUG))
    .limit(1);
  if (existing) return existing.id;

  try {
    const [created] = await db
      .insert(organizations)
      .values({
        name: PUBLIC_ORG_NAME,
        slug: PUBLIC_ORG_SLUG,
        isDefault: true,
        status: 'active',
      })
      .returning({ id: organizations.id });
    return created.id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, PUBLIC_ORG_SLUG))
      .limit(1);
    if (!row) throw err;
    return row.id;
  }
}

/** Gives a learner the public organization when they have none. Tutors and admins are left alone. */
export async function ensureLearnerMembership(userId: string): Promise<void> {
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.role !== 'learner') return;

  const [existing] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, userId))
    .limit(1);
  if (existing) return;

  const organizationId = await ensurePublicOrganization();
  try {
    await db.insert(organizationMemberships).values({
      organizationId,
      userId,
      role: 'member',
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

export interface MembershipView {
  organizationId: number;
  role: string;
  organizationName: string;
  slug: string;
  isDefault: boolean;
  status: string;
}

export async function loadMembership(userId: string): Promise<MembershipView | null> {
  const [row] = await db
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
      organizationName: organizations.name,
      slug: organizations.slug,
      isDefault: organizations.isDefault,
      status: organizations.status,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(eq(organizationMemberships.userId, userId))
    .limit(1);
  return row ?? null;
}

async function clearGroups(userId: string): Promise<void> {
  await db.delete(groupMemberships).where(eq(groupMemberships.userId, userId));
}

async function revokePendingInvitations(userId: string, exceptId?: number): Promise<void> {
  const filters = [
    eq(organizationInvitations.userId, userId),
    eq(organizationInvitations.status, 'pending'),
  ];
  if (exceptId !== undefined) filters.push(ne(organizationInvitations.id, exceptId));
  await db
    .update(organizationInvitations)
    .set({ status: 'revoked', respondedAt: new Date() })
    .where(and(...filters));
}

export async function createOrganization(name: string, slug: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) {
    throw new OrganizationError(400, 'A name is required.');
  }
  if (!isValidSlug(slug)) {
    throw new OrganizationError(400, 'Use a lowercase slug of letters, numbers, and hyphens.');
  }

  try {
    const [row] = await db
      .insert(organizations)
      .values({ name: trimmed, slug, isDefault: false, status: 'active' })
      .returning({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        isDefault: organizations.isDefault,
      });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new OrganizationError(409, 'That slug is already in use.');
    throw err;
  }
}

/**
 * Places the first administrator, or promotes someone already in the organization.
 *
 * A learner who still belongs to a different private organization is refused.
 * Moving them would skip that organization's retirement.
 */
export async function appointAdministrator(organizationId: number, email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new OrganizationError(400, 'A valid email is required.');

  const [org] = await db
    .select({ id: organizations.id, isDefault: organizations.isDefault, status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org || org.status !== 'active') throw new OrganizationError(404, 'Not found');

  const [learner] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  if (!learner || learner.role !== 'learner' || learner.status !== 'active') {
    throw new OrganizationError(400, 'That learner is not available to appoint.');
  }

  const membership = await loadMembership(learner.id);
  if (!membership) throw new OrganizationError(400, 'That learner is not available to appoint.');

  const sameOrg = membership.organizationId === organizationId;
  const fromPublic = membership.isDefault && !org.isDefault;
  if (!sameOrg && !fromPublic) {
    throw new OrganizationError(400, 'That learner is not available to appoint.');
  }

  if (!sameOrg) {
    await clearGroups(learner.id);
    await revokePendingInvitations(learner.id);
    await db
      .update(organizationMemberships)
      .set({ organizationId, role: 'admin', joinedAt: new Date() })
      .where(eq(organizationMemberships.userId, learner.id));
    return;
  }

  await db
    .update(organizationMemberships)
    .set({ role: 'admin' })
    .where(eq(organizationMemberships.userId, learner.id));
}

export async function retireLearner(actorOrganizationId: number, learnerId: string): Promise<void> {
  const membership = await loadMembership(learnerId);
  if (!membership || membership.organizationId !== actorOrganizationId) {
    throw new OrganizationError(404, 'Not found');
  }
  if (membership.isDefault) {
    throw new OrganizationError(400, 'This learner is already in the public organization.');
  }
  if (membership.role === 'admin') {
    const [countRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(organizationMemberships)
      .where(and(
        eq(organizationMemberships.organizationId, actorOrganizationId),
        eq(organizationMemberships.role, 'admin'),
      ));
    if (Number(countRow?.n ?? 0) <= 1) {
      throw new OrganizationError(400, 'Appoint another administrator before removing this one.');
    }
  }

  const publicId = await ensurePublicOrganization();
  await clearGroups(learnerId);
  await db
    .update(organizationMemberships)
    .set({ organizationId: publicId, role: 'member', joinedAt: new Date() })
    .where(eq(organizationMemberships.userId, learnerId));
  await revokePendingInvitations(learnerId);
}

export interface SentInvitation {
  invitationId: number;
  learnerId: string;
  organizationName: string;
}

export async function sendInvitation(input: {
  destinationOrganizationId: number;
  invitedByUserId: string;
  email: string;
}): Promise<SentInvitation> {
  const [destination] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      isDefault: organizations.isDefault,
      status: organizations.status,
    })
    .from(organizations)
    .where(eq(organizations.id, input.destinationOrganizationId))
    .limit(1);
  if (!destination || destination.status !== 'active') throw new OrganizationError(404, 'Not found');

  const email = normalizeEmail(input.email);
  const [learner] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let facts: {
    role: string;
    status: string;
    currentIsDefault: boolean;
    alreadyMember: boolean;
    pending: boolean;
  } | null = null;

  if (learner) {
    const membership = await loadMembership(learner.id);
    const [pending] = await db
      .select({ id: organizationInvitations.id })
      .from(organizationInvitations)
      .where(and(
        eq(organizationInvitations.organizationId, destination.id),
        eq(organizationInvitations.userId, learner.id),
        eq(organizationInvitations.status, 'pending'),
      ))
      .limit(1);
    facts = {
      role: learner.role,
      status: learner.status,
      currentIsDefault: membership?.isDefault === true,
      alreadyMember: membership?.organizationId === destination.id,
      pending: Boolean(pending),
    };
  }

  const reason = inviteBlock({
    email,
    destinationIsDefault: destination.isDefault,
    learner: facts,
  });
  if (reason) {
    throw new OrganizationError(reason === 'already_pending' ? 409 : 400, inviteErrorMessage(reason));
  }
  if (!learner) throw new OrganizationError(400, inviteErrorMessage('unavailable'));

  const [created] = await db
    .insert(organizationInvitations)
    .values({
      organizationId: destination.id,
      userId: learner!.id,
      invitedByUserId: input.invitedByUserId,
      status: 'pending',
    })
    .returning({ id: organizationInvitations.id });

  return {
    invitationId: created.id,
    learnerId: learner!.id,
    organizationName: destination.name,
  };
}

export async function respondToInvitation(
  userId: string,
  invitationId: number,
  action: 'accept' | 'decline',
): Promise<void> {
  const [invite] = await db
    .select()
    .from(organizationInvitations)
    .where(and(
      eq(organizationInvitations.id, invitationId),
      eq(organizationInvitations.userId, userId),
      eq(organizationInvitations.status, 'pending'),
    ))
    .limit(1);
  if (!invite) throw new OrganizationError(404, 'Not found');

  if (action === 'decline') {
    await db
      .update(organizationInvitations)
      .set({ status: 'declined', respondedAt: new Date() })
      .where(eq(organizationInvitations.id, invite.id));
    return;
  }

  const membership = await loadMembership(userId);
  const [destination] = await db
    .select({ id: organizations.id, isDefault: organizations.isDefault, status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId))
    .limit(1);

  const alreadyThere = membership?.organizationId === invite.organizationId;
  const canMove = membership?.isDefault === true && destination?.status === 'active' && destination.isDefault === false;

  if (!alreadyThere && !canMove) {
    await db
      .update(organizationInvitations)
      .set({ status: 'revoked', respondedAt: new Date() })
      .where(eq(organizationInvitations.id, invite.id));
    throw new OrganizationError(400, 'This invitation is no longer available.');
  }

  if (!alreadyThere) {
    await clearGroups(userId);
    await db
      .update(organizationMemberships)
      .set({ organizationId: invite.organizationId, role: 'member', joinedAt: new Date() })
      .where(eq(organizationMemberships.userId, userId));
  }

  await db
    .update(organizationInvitations)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(eq(organizationInvitations.id, invite.id));
  await revokePendingInvitations(userId, invite.id);
}

export async function revokeInvitation(organizationId: number, invitationId: number): Promise<void> {
  const [invite] = await db
    .select({ id: organizationInvitations.id })
    .from(organizationInvitations)
    .where(and(
      eq(organizationInvitations.id, invitationId),
      eq(organizationInvitations.organizationId, organizationId),
      eq(organizationInvitations.status, 'pending'),
    ))
    .limit(1);
  if (!invite) throw new OrganizationError(404, 'Not found');

  await db
    .update(organizationInvitations)
    .set({ status: 'revoked', respondedAt: new Date() })
    .where(eq(organizationInvitations.id, invite.id));
}

export async function listMyInvitations(userId: string) {
  return db
    .select({
      id: organizationInvitations.id,
      organizationName: organizations.name,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizationInvitations.organizationId, organizations.id))
    .where(and(
      eq(organizationInvitations.userId, userId),
      eq(organizationInvitations.status, 'pending'),
    ))
    .orderBy(asc(organizationInvitations.createdAt));
}

export async function listMyGroups(userId: string, organizationId: number) {
  return db
    .select({ id: groups.id, name: groups.name })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(and(
      eq(groupMemberships.userId, userId),
      eq(groups.organizationId, organizationId),
    ))
    .orderBy(asc(groups.name));
}

export async function listOrganizations() {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      isDefault: organizations.isDefault,
      status: organizations.status,
      hybridTutoringEnabled: organizations.hybridTutoringEnabled,
      createdAt: organizations.createdAt,
      memberCount: sql<number>`count(${organizationMemberships.id})::int`,
    })
    .from(organizations)
    .leftJoin(organizationMemberships, eq(organizationMemberships.organizationId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(asc(organizations.name));
  return rows;
}

export async function listRoster(organizationId: number) {
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      membershipRole: organizationMemberships.role,
      joinedAt: organizationMemberships.joinedAt,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(organizationMemberships.userId, users.id))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(users.name));

  if (members.length === 0) return [];

  const groupRows = await db
    .select({
      userId: groupMemberships.userId,
      groupId: groups.id,
      groupName: groups.name,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
    .where(and(
      eq(groups.organizationId, organizationId),
      inArray(groupMemberships.userId, members.map((m) => m.id)),
    ));

  const byUser = new Map<string, { id: number; name: string }[]>();
  for (const row of groupRows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ id: row.groupId, name: row.groupName });
    byUser.set(row.userId, list);
  }

  return members.map((member) => ({
    ...member,
    groups: byUser.get(member.id) ?? [],
  }));
}

export async function listOrgInvitations(organizationId: number) {
  return db
    .select({
      id: organizationInvitations.id,
      email: users.email,
      name: users.name,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .innerJoin(users, eq(organizationInvitations.userId, users.id))
    .where(and(
      eq(organizationInvitations.organizationId, organizationId),
      eq(organizationInvitations.status, 'pending'),
    ))
    .orderBy(asc(organizationInvitations.createdAt));
}

export async function listGroups(organizationId: number) {
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      memberCount: sql<number>`count(${groupMemberships.id})::int`,
    })
    .from(groups)
    .leftJoin(groupMemberships, eq(groupMemberships.groupId, groups.id))
    .where(eq(groups.organizationId, organizationId))
    .groupBy(groups.id)
    .orderBy(asc(groups.name));
  return rows;
}

export async function createGroup(organizationId: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) throw new OrganizationError(400, 'A name is required.');
  try {
    const [row] = await db
      .insert(groups)
      .values({ organizationId, name: trimmed })
      .returning({ id: groups.id, name: groups.name });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new OrganizationError(409, 'A group with that name already exists.');
    throw err;
  }
}

export async function renameGroup(organizationId: number, groupId: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) throw new OrganizationError(400, 'A name is required.');

  const [row] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new OrganizationError(404, 'Not found');

  try {
    const [updated] = await db
      .update(groups)
      .set({ name: trimmed })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id, name: groups.name });
    return updated;
  } catch (err) {
    if (isUniqueViolation(err)) throw new OrganizationError(409, 'A group with that name already exists.');
    throw err;
  }
}

export async function deleteGroup(organizationId: number, groupId: number): Promise<void> {
  const [row] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new OrganizationError(404, 'Not found');

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groupMemberships)
    .where(eq(groupMemberships.groupId, groupId));
  if (Number(countRow?.n ?? 0) > 0) {
    throw new OrganizationError(400, 'Remove everyone from this group before deleting it.');
  }

  await db.delete(groups).where(eq(groups.id, groupId));
}

export async function addGroupMember(
  organizationId: number,
  groupId: number,
  userId: string,
): Promise<{ groupName: string; organizationName: string }> {
  const [group] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.organizationId, organizationId)))
    .limit(1);
  if (!group) throw new OrganizationError(404, 'Not found');

  const membership = await loadMembership(userId);
  if (!membership || membership.organizationId !== organizationId) {
    throw new OrganizationError(400, 'That learner is not in this organization.');
  }

  try {
    await db.insert(groupMemberships).values({ groupId, userId });
  } catch (err) {
    if (isUniqueViolation(err)) throw new OrganizationError(409, 'That learner is already in this group.');
    throw err;
  }

  return { groupName: group.name, organizationName: membership.organizationName };
}

export async function removeGroupMember(
  organizationId: number,
  groupId: number,
  userId: string,
): Promise<{ groupName: string; organizationName: string } | null> {
  const [group] = await db
    .select({ id: groups.id, name: groups.name, organizationName: organizations.name })
    .from(groups)
    .innerJoin(organizations, eq(groups.organizationId, organizations.id))
    .where(and(eq(groups.id, groupId), eq(groups.organizationId, organizationId)))
    .limit(1);
  if (!group) throw new OrganizationError(404, 'Not found');

  const removed = await db
    .delete(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)))
    .returning({ id: groupMemberships.id });
  if (removed.length === 0) return null;
  return { groupName: group.name, organizationName: group.organizationName };
}

export async function listProgress(organizationId: number, groupId?: number) {
  const filters = [eq(organizationMemberships.organizationId, organizationId)];
  if (groupId) {
    const memberIds = await db
      .select({ userId: groupMemberships.userId })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .where(and(
        eq(groupMemberships.groupId, groupId),
        eq(groups.organizationId, organizationId),
      ));
    const ids = memberIds.map((row) => row.userId);
    if (ids.length === 0) return [];
    filters.push(inArray(organizationMemberships.userId, ids));
  }

  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      courseTitle: courses.title,
      targetLanguage: studentProgress.targetLanguage,
      status: studentProgress.status,
      lessonsCompleted: studentProgress.lessonsCompleted,
      xpEarned: studentProgress.xpEarned,
      lastActivityAt: studentProgress.lastActivityAt,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(organizationMemberships.userId, users.id))
    .leftJoin(studentProgress, eq(studentProgress.userId, users.id))
    .leftJoin(courses, eq(studentProgress.courseId, courses.id))
    .where(and(...filters))
    .orderBy(asc(users.name), asc(courses.title));
}
