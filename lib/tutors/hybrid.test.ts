import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonTimings } from '@/lib/courses/syllabus';
import { normalizeEditedPlan, parseLessonPlan } from './lesson-plan';
import { normalizeLessonCorrections, parseLessonCorrections } from './lesson-notes';
import { normalizeTrialScores, qualityFlagReason, vettingGaps } from './quality-rules';
import { rankBySharedLanguage, shouldWarnBeforeBooking } from './matching';
import { dailyCaptionMinutes, defaultCaptionMode } from './captions';
import { quizPassed, TEACHING_MODULE_QUIZ } from './vetting-content';

const timings = lessonTimings(30, 0.25);
const context = { timings, unit: null, fixShare: 0.25, weakPatterns: ['past simple of irregular verbs'] };

test('a lesson plan takes its minutes from the template, not the model', () => {
  const plan = parseLessonPlan(JSON.stringify({
    objectives: ['Talk about last weekend'],
    phases: [
      { key: 'present', activities: ['Show a picture timeline'], minutes: 999 },
      { key: 'made_up', activities: ['ignored'] },
    ],
    fixSlot: [
      { pattern: 'past simple of irregular verbs', exercise: 'Irregular verb chain' },
      { pattern: 'something they never got wrong', exercise: 'Invented work' },
    ],
    slides: [{ phrase: 'I went to the market.', translation: '市場に行きました。', cue: 'mime walking' }, { phrase: '' }],
  }), context);

  assert.deepEqual(plan.phases.map((p) => p.minutes), timings.map((t) => t.minutes));
  assert.deepEqual(plan.phases.find((p) => p.key === 'present')?.activities, ['Show a picture timeline']);
  assert.equal(plan.fixSlot.length, 1, 'a fix for a pattern the learner does not have is dropped');
  assert.equal(plan.slides.length, 1);
  assert.throws(() => parseLessonPlan(JSON.stringify({ phases: [] }), context), /no phase activities/);
});

test('a tutor edit keeps the template skeleton', () => {
  const plan = parseLessonPlan(JSON.stringify({ phases: [{ key: 'warm_up', activities: ['Recap'] }] }), context);
  const edited = normalizeEditedPlan(
    { phases: [{ key: 'warm_up', activities: ['New recap'] }, { key: 'extra', activities: ['nope'] }], homework: 'Pack 3' },
    plan,
  );
  assert.ok(edited);
  assert.equal(edited.phases.length, plan.phases.length);
  assert.deepEqual(edited.phases[0].activities, ['New recap']);
  assert.equal(edited.homework, 'Pack 3');
});

test('lesson corrections keep only real corrections', () => {
  const list = normalizeLessonCorrections([
    { original: 'I goed', corrected: 'I went', note: 'irregular' },
    { original: 'same', corrected: 'same' },
    { original: '', corrected: 'x' },
    'junk',
  ]);
  assert.deepEqual(list, [{ original: 'I goed', corrected: 'I went', note: 'irregular' }]);
  assert.deepEqual(parseLessonCorrections('{bad'), []);
});

test('tutors are flagged only on enough samples below threshold', () => {
  assert.equal(qualityFlagReason({ reviewCount: 4, averageRating: 2, evaluationCount: 0, agreementRate: null }), null);
  assert.match(qualityFlagReason({ reviewCount: 5, averageRating: 3.6, evaluationCount: 0, agreementRate: null }) ?? '', /rating/);
  assert.match(qualityFlagReason({ reviewCount: 0, averageRating: null, evaluationCount: 6, agreementRate: 0.5 }) ?? '', /agrees/);
  assert.equal(qualityFlagReason({ reviewCount: 20, averageRating: 4.8, evaluationCount: 20, agreementRate: 0.9 }), null);
});

test('verification needs every vetting check', () => {
  const trial = normalizeTrialScores({ correctionQuality: 4, talkTimeBalance: 3, levelAdaptation: 5 });
  assert.ok(trial);
  assert.equal(normalizeTrialScores({ correctionQuality: 6, talkTimeBalance: 3, levelAdaptation: 5 }), null);
  const passing = { proficiencyPassed: true, proficiencyReason: null, clarityScore: 90, trialScores: trial, teachingModuleCompleted: true };
  assert.deepEqual(vettingGaps(passing), []);
  assert.equal(vettingGaps({ ...passing, proficiencyPassed: false, proficiencyReason: 'B2 is below C1.' })[0], 'B2 is below C1.');
  assert.equal(vettingGaps({ ...passing, clarityScore: 70 }).length, 1);
  assert.equal(vettingGaps({ ...passing, trialScores: { ...trial, talkTimeBalance: 2 } }).length, 1);
});

test('beginners see tutors who share their language first; others keep the order', () => {
  const tutors = [
    { id: 1, instructionLanguages: ['en'] },
    { id: 2, instructionLanguages: ['en', 'sw'] },
    { id: 3, instructionLanguages: ['fr'] },
  ];
  assert.deepEqual(rankBySharedLanguage(tutors, 'sw', 'A1').map((t) => t.id), [2, 1, 3]);
  assert.deepEqual(rankBySharedLanguage(tutors, 'sw', null).map((t) => t.id), [2, 1, 3]);
  assert.deepEqual(rankBySharedLanguage(tutors, 'sw', 'B1').map((t) => t.id), [1, 2, 3]);
  assert.equal(rankBySharedLanguage(tutors, 'sw', 'B1')[1].sharesLanguage, true);
  assert.equal(shouldWarnBeforeBooking('A0'), true);
  assert.equal(shouldWarnBeforeBooking('A1'), false);
});

test('captions fade out with level', () => {
  assert.equal(defaultCaptionMode(null), 'translated');
  assert.equal(defaultCaptionMode('A1'), 'translated');
  assert.equal(defaultCaptionMode('A2'), 'transcript');
  assert.equal(defaultCaptionMode('B1'), 'off');
  assert.ok(dailyCaptionMinutes('A1') > dailyCaptionMinutes('B2'));
});

test('the teaching-module quiz needs every answer right', () => {
  const right = Object.fromEntries(TEACHING_MODULE_QUIZ.map((q) => [q.id, q.answer]));
  assert.equal(quizPassed(right), true);
  assert.equal(quizPassed({ ...right, [TEACHING_MODULE_QUIZ[0].id]: 2 }), false);
  assert.equal(quizPassed(null), false);
});
