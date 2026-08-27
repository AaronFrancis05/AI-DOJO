import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePhaseState, SAFETY_CAP_TURN, type PhaseState } from './phase-engine';

/**
 * The phase machine is what decides when the character explains a stage,
 * concludes it, and moves on. Two things must hold for every session:
 * it always reaches the debrief and the farewell, and it never repeats a
 * beat forever. Both were broken before — `evaluation` had no exit edge, and
 * completion short-circuited out of `unguided` so the debrief never ran.
 */

/** Walks the machine until it completes, returning the beats it passed through. */
function run(opts: {
  icebreakerDoneAfter: number;
  goalsCoveredAfter: number;
  maxTurns?: number;
}): Array<`${string}:${string}`> {
  const beats: Array<`${string}:${string}`> = [];
  let state: PhaseState = { phase: 'orientation', step: 'open' };

  for (let turn = 1; turn <= (opts.maxTurns ?? 200); turn++) {
    beats.push(`${state.phase}:${state.step}`);
    if (state.phase === 'completed') return beats;

    state = advancePhaseState(state, {
      icebreakerDone: turn >= opts.icebreakerDoneAfter,
      allGoalsCovered: turn >= opts.goalsCoveredAfter,
    });
  }

  throw new Error(`never completed; last beats: ${beats.slice(-8).join(' → ')}`);
}

test('every phase gets an opening beat and a closing beat of its own', () => {
  const beats = run({ icebreakerDoneAfter: 4, goalsCoveredAfter: 8 });

  for (const phase of ['icebreaker', 'guided', 'unguided', 'evaluation']) {
    assert.ok(beats.includes(`${phase}:open`), `${phase} never opened: ${beats.join(' → ')}`);
    assert.ok(beats.includes(`${phase}:closing`), `${phase} never closed: ${beats.join(' → ')}`);
  }
});

test('a phase never opens on the same turn another one closes', () => {
  const beats = run({ icebreakerDoneAfter: 4, goalsCoveredAfter: 8 });
  // Each entry is one turn, so a closing beat and an opening beat can never
  // be the same entry. This is the invariant the old string-append broke.
  for (const beat of beats) {
    assert.ok(!(beat.includes('closing') && beat.includes('open')), beat);
  }
});

test('orientation hands over without a closing beat of its own', () => {
  const beats = run({ icebreakerDoneAfter: 4, goalsCoveredAfter: 8 });
  assert.deepEqual(beats.slice(0, 2), ['orientation:open', 'icebreaker:open']);
});

test('the debrief is always reached before the session completes', () => {
  const beats = run({ icebreakerDoneAfter: 2, goalsCoveredAfter: 3 });
  const evalIdx = beats.indexOf('evaluation:open');
  const farewellIdx = beats.indexOf('evaluation:closing');
  const doneIdx = beats.indexOf('completed:open');

  assert.ok(evalIdx > -1, 'no debrief');
  assert.ok(farewellIdx > evalIdx, 'no farewell after the debrief');
  assert.ok(doneIdx > farewellIdx, 'completed before the farewell was spoken');
});

test('a learner who covers everything immediately still gets every beat', () => {
  // The regression that started this: the model calling the scene complete on
  // the first unguided turn used to fire the celebration outright.
  const beats = run({ icebreakerDoneAfter: 1, goalsCoveredAfter: 1 });
  assert.ok(beats.includes('evaluation:open'), beats.join(' → '));
  assert.ok(beats.includes('evaluation:closing'), beats.join(' → '));
});

test('a learner who never covers a goal still terminates', () => {
  // In the route, the stall threshold and the safety cap force
  // allGoalsCovered true; here that is simulated by the turn bound.
  const beats = run({ icebreakerDoneAfter: 3, goalsCoveredAfter: SAFETY_CAP_TURN });
  assert.equal(beats.at(-1), 'completed:open');
});
