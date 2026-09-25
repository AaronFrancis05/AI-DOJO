/**
 * Decisions for organization membership that do not touch the database.
 *
 * Invite failures that would reveal which organization a learner belongs to
 * collapse to one sentence. The destination being the public organization is
 * a fact about the organization the caller already administers, so it can be
 * named.
 */

export const PUBLIC_ORG_SLUG = 'ai-dojo';
export const PUBLIC_ORG_NAME = 'AI DOJO';

export const INVITE_UNAVAILABLE = 'This learner cannot be invited right now.';

export const ORG_MEMBERSHIP_ROLES = ['member', 'admin'] as const;
export type OrgMembershipRole = (typeof ORG_MEMBERSHIP_ROLES)[number];

export type InviteBlockReason =
  | 'invalid_email'
  | 'public_destination'
  | 'already_pending'
  | 'unavailable';

export interface InviteLearnerFacts {
  role: string;
  status: string;
  /** Their current organization is the default public one. */
  currentIsDefault: boolean;
  alreadyMember: boolean;
  pending: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.includes('@') && !email.includes(' ') && email.length > 3 && email.length <= 150;
}

/** Slugs an administrator may choose. The public organization's slug is reserved. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 60 && slug !== PUBLIC_ORG_SLUG;
}

export function slugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return isValidSlug(slug) ? slug : '';
}

/**
 * Why an invitation must be refused, or null when it may be sent.
 *
 * A learner who still belongs to some other organization is indistinguishable
 * here from a missing account, a tutor, or a suspended learner.
 */
export function inviteBlock(input: {
  email: string;
  destinationIsDefault: boolean;
  learner: InviteLearnerFacts | null;
}): InviteBlockReason | null {
  if (input.destinationIsDefault) return 'public_destination';
  if (!isValidEmail(normalizeEmail(input.email))) return 'invalid_email';

  const learner = input.learner;
  if (!learner || learner.role !== 'learner' || learner.status !== 'active') return 'unavailable';
  if (learner.pending) return 'already_pending';
  if (!learner.currentIsDefault || learner.alreadyMember) return 'unavailable';
  return null;
}

export function inviteErrorMessage(reason: InviteBlockReason): string {
  switch (reason) {
    case 'invalid_email':
      return 'A valid email is required.';
    case 'public_destination':
      return 'The public organization does not accept invitations.';
    case 'already_pending':
      return 'An invitation is already pending.';
    case 'unavailable':
      return INVITE_UNAVAILABLE;
  }
}
