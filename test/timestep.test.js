import test from 'node:test';
import assert from 'node:assert/strict';

import { advance } from '../js/timestep.js';
import { CONFIG } from '../js/config.js';

test('one interval of elapsed time produces exactly one step', () => {
  const { steps, accumulator } = advance(0, CONFIG.baseInterval / 1000, CONFIG.baseInterval);
  assert.equal(steps, 1);
  assert.ok(Math.abs(accumulator) < 1e-9);
});

test('leftover time carries into the next frame', () => {
  const first = advance(0, 0.05, 100);
  assert.equal(first.steps, 0);
  assert.ok(Math.abs(first.accumulator - 0.05) < 1e-9);

  const second = advance(first.accumulator, 0.05, 100);
  assert.equal(second.steps, 1);
  assert.ok(Math.abs(second.accumulator) < 1e-9);
});

test('a long frame yields multiple steps', () => {
  const { steps } = advance(0, 0.4, 100);
  assert.equal(steps, 4);
});

test('steps are capped so a backgrounded tab cannot fast-forward the game', () => {
  const { steps } = advance(0, 100, 100);
  assert.equal(steps, 5);
});

test('units are seconds on the dt side and milliseconds on the interval side', () => {
  // Passing a millisecond value as dt would trip the cap, not produce 1000 steps.
  assert.equal(advance(0, 130, 130).steps, 5);
  assert.equal(advance(0, 0.13, 130).steps, 1);
});
