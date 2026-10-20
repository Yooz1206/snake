import test from 'node:test';
import assert from 'node:assert/strict';

import { TOKENS, TEXT_PAIRS, GRAPHIC_PAIRS, contrastRatio } from '../js/theme.js';
import { shouldPauseOnBlur, countdownLeavesExceeded, countdownValue } from '../js/controls.js';

test('every small-text pair clears 4.5:1 (R6.1)', () => {
  for (const [foreground, background] of TEXT_PAIRS) {
    const ratio = contrastRatio(TOKENS[foreground], TOKENS[background]);
    assert.ok(
      ratio >= 4.5,
      `${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs 4.5:1`,
    );
  }
});

test('graphics stay distinguishable at 3:1', () => {
  for (const [foreground, background] of GRAPHIC_PAIRS) {
    const ratio = contrastRatio(TOKENS[foreground], TOKENS[background]);
    assert.ok(ratio >= 3, `${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
  }
});

test('the muted token is the reviewed value, not the old one', () => {
  assert.equal(TOKENS.muted, '#7a8796');
  assert.ok(contrastRatio('#5d6875', '#0a0d12') < 4.5, 'the old token really did fail');
});

test('a blur only pauses after the debounce window', () => {
  assert.equal(shouldPauseOnBlur(0, 99), false);
  assert.equal(shouldPauseOnBlur(0, 100), true);
});

test('leaving more than three times during the countdown ends the run', () => {
  assert.equal(countdownLeavesExceeded(3), false);
  assert.equal(countdownLeavesExceeded(4), true);
});

test('the countdown counts down and stops at zero', () => {
  assert.equal(countdownValue(0), 3);
  assert.equal(countdownValue(400), 2);
  assert.equal(countdownValue(800), 1);
  assert.equal(countdownValue(1200), 0);
});
