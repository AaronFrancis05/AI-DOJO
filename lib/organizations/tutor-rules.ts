/**
 * Who may start something new with a tutor, and who may still enter a session
 * that already exists.
 *
 * Organization permission is a creation rule. A private organization with no
 * rows allows nobody. The public organization does not consult the table.
 * Joining a booking, seat or queue place that was already granted does not
 * read the table again. Account suspension and a withdrawn verification are
 * a different fact: they can still close a session that was booked earlier.
 */

export interface LearnerTutorScope {
  /** Platform admin. The catalogue is not limited by an organization. */
  unrestricted: boolean;
  /**
   * The learner's organization. `true` is the public organization, `false`
   * a private one, `null` when this account has no learner membership.
   */
  isDefault: boolean | null;
}

export interface TutorOffer {
  verified: boolean;
  accepting: boolean;
  accountActive: boolean;
  /** True when the learner's private organization has a permission row. */
  permitted: boolean;
}

export function mayStartWithTutor(scope: LearnerTutorScope, tutor: TutorOffer | null): boolean {
  if (!tutor || !tutor.verified || !tutor.accepting || !tutor.accountActive) return false;
  if (scope.unrestricted || scope.isDefault === true) return true;
  if (scope.isDefault === false) return tutor.permitted;
  return false;
}

/**
 * A room the learner is already in stays listed. A new one uses the same
 * rule as starting a booking.
 */
export function mayDiscoverTutor(
  scope: LearnerTutorScope,
  tutor: TutorOffer | null,
  committed: boolean,
): boolean {
  if (committed) return true;
  return mayStartWithTutor(scope, tutor);
}

export function mayBrowseTutors(input: {
  role: 'learner' | 'tutor' | 'admin';
  scope: LearnerTutorScope | null;
  bookableCount: number;
}): boolean {
  if (input.role === 'admin') return true;
  if (input.role !== 'learner' || !input.scope) return false;
  return input.bookableCount > 0;
}

/** Execution. Accepting new bookings is not part of this. */
export function tutorMayHoldSession(input: {
  accountStatus: string;
  verificationStatus: string;
}): boolean {
  return input.accountStatus === 'active' && input.verificationStatus === 'verified';
}
