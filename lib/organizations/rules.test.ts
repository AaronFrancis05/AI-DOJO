import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INVITE_UNAVAILABLE,
  inviteBlock,
  inviteErrorMessage,
  isValidSlug,
  slugFromName,
} from './rules';

const publicLearner = {
  role: 'learner',
  status: 'active',
  currentIsDefault: true,
  alreadyMember: false,
  pending: false,
};

test('a learner in the public organization can be invited', () => {
  assert.equal(inviteBlock({
    email: 'ada@school.test',
    destinationIsDefault: false,
    learner: publicLearner,
  }), null);
});

test('a learner still in another organization is refused without naming it', () => {
  const reason = inviteBlock({
    email: 'ada@school.test',
    destinationIsDefault: false,
    learner: { ...publicLearner, currentIsDefault: false },
  });
  assert.equal(reason, 'unavailable');
  assert.equal(inviteErrorMessage(reason!), INVITE_UNAVAILABLE);
  assert.equal(INVITE_UNAVAILABLE.includes('organization'), false);
});

test('a missing account, a tutor, and a suspended learner look the same', () => {
  const cases = [
    null,
    { ...publicLearner, role: 'tutor' },
    { ...publicLearner, status: 'suspended' },
  ];
  for (const learner of cases) {
    assert.equal(inviteBlock({
      email: 'ada@school.test',
      destinationIsDefault: false,
      learner,
    }), 'unavailable');
  }
});

test('the public organization is not an invitation destination', () => {
  assert.equal(inviteBlock({
    email: 'ada@school.test',
    destinationIsDefault: true,
    learner: publicLearner,
  }), 'public_destination');
});

test('a second pending invitation to the same organization is reported as pending', () => {
  assert.equal(inviteBlock({
    email: 'ada@school.test',
    destinationIsDefault: false,
    learner: { ...publicLearner, pending: true },
  }), 'already_pending');
});

test('slug rules keep the public organization slug reserved', () => {
  assert.equal(isValidSlug('ai-dojo'), false);
  assert.equal(isValidSlug('Makerere'), false);
  assert.equal(isValidSlug('makerere-japanese'), true);
  assert.equal(slugFromName('Makerere Japanese'), 'makerere-japanese');
  assert.equal(slugFromName('AI DOJO'), '');
});
