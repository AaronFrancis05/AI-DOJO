import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mayBrowseTutors,
  mayDiscoverTutor,
  mayStartWithTutor,
  tutorMayHoldSession,
  type LearnerTutorScope,
  type TutorOffer,
} from './tutor-rules';

const publicScope: LearnerTutorScope = { unrestricted: false, isDefault: true };
const privateScope: LearnerTutorScope = { unrestricted: false, isDefault: false };
const noOrg: LearnerTutorScope = { unrestricted: false, isDefault: null };
const adminScope: LearnerTutorScope = { unrestricted: true, isDefault: null };

const openTutor: TutorOffer = {
  verified: true,
  accepting: true,
  accountActive: true,
  permitted: false,
};

test('the public organization can start with any bookable tutor', () => {
  assert.equal(mayStartWithTutor(publicScope, openTutor), true);
});

test('a private organization can start only with a permitted tutor', () => {
  assert.equal(mayStartWithTutor(privateScope, openTutor), false);
  assert.equal(mayStartWithTutor(privateScope, { ...openTutor, permitted: true }), true);
});

test('a bookable flag is required even when the tutor is permitted', () => {
  const permitted = { ...openTutor, permitted: true };
  assert.equal(mayStartWithTutor(privateScope, { ...permitted, verified: false }), false);
  assert.equal(mayStartWithTutor(privateScope, { ...permitted, accepting: false }), false);
  assert.equal(mayStartWithTutor(privateScope, { ...permitted, accountActive: false }), false);
  assert.equal(mayStartWithTutor(publicScope, { ...openTutor, accepting: false }), false);
});

test('an account with no organization cannot start a session', () => {
  assert.equal(mayStartWithTutor(noOrg, { ...openTutor, permitted: true }), false);
});

test('a platform admin is not limited by an organization permission', () => {
  assert.equal(mayStartWithTutor(adminScope, openTutor), true);
});

test('an existing commitment stays visible after permission is removed', () => {
  assert.equal(mayDiscoverTutor(privateScope, openTutor, true), true);
  assert.equal(mayDiscoverTutor(privateScope, openTutor, false), false);
});

test('the learner menu follows bookable tutors, and other roles do not', () => {
  assert.equal(mayBrowseTutors({ role: 'learner', scope: privateScope, bookableCount: 0 }), false);
  assert.equal(mayBrowseTutors({ role: 'learner', scope: publicScope, bookableCount: 1 }), true);
  assert.equal(mayBrowseTutors({ role: 'learner', scope: null, bookableCount: 3 }), false);
  assert.equal(mayBrowseTutors({ role: 'admin', scope: null, bookableCount: 0 }), true);
  assert.equal(mayBrowseTutors({ role: 'tutor', scope: publicScope, bookableCount: 4 }), false);
});

test('holding a session checks the account and the verification, not new bookings', () => {
  assert.equal(tutorMayHoldSession({ accountStatus: 'active', verificationStatus: 'verified' }), true);
  assert.equal(tutorMayHoldSession({ accountStatus: 'suspended', verificationStatus: 'verified' }), false);
  assert.equal(tutorMayHoldSession({ accountStatus: 'deleted', verificationStatus: 'verified' }), false);
  assert.equal(tutorMayHoldSession({ accountStatus: 'active', verificationStatus: 'rejected' }), false);
});
