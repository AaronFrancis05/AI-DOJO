import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cefrFromScores,
  checkTutorProficiency,
  compareCefr,
  parseCefrVerdict,
  proficiencyForCefr,
} from './cefr';
import { buildGradingInstruction } from './prompt';
import type { TurnScores } from '@/lib/roleplay/score-dimensions';

const flat = (n: number): TurnScores => ({
  vocabulary: n, grammar: n, fluency: n, cultural: n, task: n, expressionAppropriateness: n,
});

test('CEFR levels order from A0 to C2', () => {
  assert.ok(compareCefr('A0', 'A1') < 0);
  assert.ok(compareCefr('C2', 'C1') > 0);
  assert.equal(compareCefr('B1', 'B1'), 0);
});

test('the grader\'s CEFR field is validated, falling back to the scores', () => {
  const ok = parseCefrVerdict({ overall: 'B2', dimensions: { grammar: 'B1', fluency: 'X9' } }, flat(50));
  assert.equal(ok.overall, 'B2');
  assert.deepEqual(ok.dimensions, { grammar: 'B1' });

  // No usable field: the scores decide, coarsely.
  assert.equal(parseCefrVerdict(undefined, flat(85)).overall, 'C1');
  assert.equal(parseCefrVerdict({ overall: 'fluent' }, flat(10)).overall, 'A0');
  assert.equal(cefrFromScores(flat(60)), 'B1');
});

test('users.level is derived from the CEFR level', () => {
  assert.equal(proficiencyForCefr('A0'), 'beginner');
  assert.equal(proficiencyForCefr('A2'), 'beginner');
  assert.equal(proficiencyForCefr('B1'), 'intermediate');
  assert.equal(proficiencyForCefr('B2'), 'intermediate');
  assert.equal(proficiencyForCefr('C1'), 'advanced');
});

test('a tutor applicant needs C1 overall and no dimension below B2', () => {
  assert.equal(checkTutorProficiency(null).passed, false);
  assert.equal(checkTutorProficiency({ overall: 'B2', dimensions: {} }).passed, false);
  const floor = checkTutorProficiency({ overall: 'C1', dimensions: { grammar: 'C1', fluency: 'B1' } });
  assert.equal(floor.passed, false);
  assert.match(floor.reason ?? '', /fluency/);
  assert.equal(checkTutorProficiency({ overall: 'C2', dimensions: { grammar: 'B2' } }).passed, true);
});

test('the grading prompt asks for CEFR only when told to', () => {
  const base = {
    assessmentTitle: 'Placement', unitTitle: null, tutorBrief: null, targetLanguage: 'en',
    nativeLanguage: 'ja', learnerLevel: 'beginner', learnerName: 'Aiko', examinerName: 'Hikaru', truncated: false,
  };
  assert.doesNotMatch(buildGradingInstruction(base), /"cefr"/);
  const withCefr = buildGradingInstruction({ ...base, cefr: true });
  assert.match(withCefr, /"cefr"/);
  assert.match(withCefr, /never on accent/);
});
