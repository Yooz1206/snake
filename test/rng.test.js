import test from 'node:test';
import assert from 'node:assert/strict';

import { fnv1a32, mulberry32, seedForDate } from '../js/rng.js';

test('fnv1a32 is a stable 32-bit hash', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('snake:v1:2026-10-20'), fnv1a32('snake:v1:2026-10-20'));
  const value = fnv1a32('snake:v1:2026-10-20');
  assert.ok(Number.isInteger(value));
  assert.ok(value >= 0 && value <= 0xffffffff);
});

test('mulberry32 replays the same sequence for the same seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const left = Array.from({ length: 5 }, () => a());
  const right = Array.from({ length: 5 }, () => b());
  assert.deepEqual(left, right);
  assert.ok(left.every((n) => n >= 0 && n < 1));
});

test('different dates produce different seeds and sequences', () => {
  assert.notEqual(seedForDate('2026-10-20'), seedForDate('2026-10-21'));

  const a = mulberry32(seedForDate('2026-10-20'));
  const b = mulberry32(seedForDate('2026-10-21'));
  assert.notDeepEqual([a(), a(), a()], [b(), b(), b()]);
});
