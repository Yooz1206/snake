import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dateKey,
  yesterdayKey,
  loadDay,
  saveDay,
  finishRun,
  loadStreak,
  updateStreak,
  displayStreak,
  pruneDaily,
} from '../js/daily.js';
import { CONFIG } from '../js/config.js';

/** A minimal in-memory Storage that behaves like the real one. */
function memory() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

const DAY = '2026-10-20';
const at = (iso) => new Date(`${iso}T12:00:00`);

test('dateKey formats a local calendar day and falls back when invalid', () => {
  assert.equal(dateKey(at('2026-10-20')), '2026-10-20');
  assert.equal(dateKey(at('2026-01-05')), '2026-01-05');
  assert.match(dateKey(new Date('nonsense')), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(yesterdayKey(at('2026-10-20')), '2026-10-19');
  assert.equal(yesterdayKey(at('2026-03-01')), '2026-02-28');
});

test('loadDay defaults to three attempts on a fresh day', () => {
  assert.deepEqual(loadDay(memory(), at(DAY)), {
    attemptsLeft: CONFIG.daily.attempts,
    best: 0,
    runs: 0,
  });
});

test('loadDay survives corrupt or hostile storage', () => {
  const storage = memory();
  storage.setItem(`snake:daily:v1:${DAY}`, '{');
  assert.deepEqual(loadDay(storage, at(DAY)), {
    attemptsLeft: CONFIG.daily.attempts,
    best: 0,
    runs: 0,
  });

  storage.setItem(`snake:daily:v1:${DAY}`, JSON.stringify({ attemptsLeft: 99, best: -5, runs: 'x' }));
  const clamped = loadDay(storage, at(DAY));
  assert.equal(clamped.attemptsLeft, CONFIG.daily.attempts, 'above range clamps to max');
  assert.equal(clamped.best, 0);
  assert.equal(clamped.runs, 0);
});

test('loadDay treats a throwing storage as empty', () => {
  const hostile = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
    key() { throw new Error('denied'); },
    length: 0,
  };
  assert.equal(loadDay(hostile, at(DAY)).attemptsLeft, CONFIG.daily.attempts);
  assert.equal(saveDay(hostile, at(DAY), { attemptsLeft: 1, best: 10, runs: 1 }), false);
});

test('finishRun decrements attempts, keeps the best and counts the run', () => {
  const start = { attemptsLeft: 3, best: 0, runs: 0 };

  const first = finishRun(start, 80);
  assert.deepEqual(first, { attemptsLeft: 2, best: 80, runs: 1 });

  const worse = finishRun(first, 20);
  assert.deepEqual(worse, { attemptsLeft: 1, best: 80, runs: 2 });

  const exhausted = finishRun({ attemptsLeft: 0, best: 80, runs: 3 }, 120);
  assert.deepEqual(exhausted, { attemptsLeft: 0, best: 120, runs: 4 });
  assert.equal(start.attemptsLeft, 3, 'finishRun must not mutate its input');
});

test('saveDay round-trips through storage', () => {
  const storage = memory();
  const state = { attemptsLeft: 2, best: 240, runs: 1 };
  assert.equal(saveDay(storage, at(DAY), state), true);
  assert.deepEqual(loadDay(storage, at(DAY)), state);
});

test('streak increments from yesterday, holds today, restarts after a gap', () => {
  const held = { count: 4, lastDate: '2026-10-19' };
  assert.deepEqual(updateStreak(held, 10, DAY), { count: 5, lastDate: DAY });

  const sameDay = { count: 5, lastDate: DAY };
  assert.deepEqual(updateStreak(sameDay, 90, DAY), { count: 5, lastDate: DAY });

  const gapped = { count: 4, lastDate: '2026-10-16' };
  assert.deepEqual(updateStreak(gapped, 10, DAY), { count: 1, lastDate: DAY });
});

test('a score below ten neither counts nor resets the streak', () => {
  const held = { count: 4, lastDate: '2026-10-19' };
  assert.deepEqual(updateStreak(held, 0, DAY), held);
  assert.deepEqual(updateStreak(held, 9, DAY), held);
});

test('displayStreak hides a streak that has gone stale', () => {
  assert.equal(displayStreak({ count: 4, lastDate: '2026-10-19' }, DAY), 4);
  assert.equal(displayStreak({ count: 4, lastDate: DAY }, DAY), 4);
  assert.equal(displayStreak({ count: 4, lastDate: '2026-10-17' }, DAY), 0);
  assert.equal(displayStreak({ count: 0, lastDate: '' }, DAY), 0);
});

test('loadStreak defaults and rejects malformed dates', () => {
  const storage = memory();
  assert.deepEqual(loadStreak(storage), { count: 0, lastDate: '' });

  storage.setItem('snake:streak:v1', JSON.stringify({ count: 3, lastDate: '20-10-2026' }));
  assert.deepEqual(loadStreak(storage), { count: 0, lastDate: '' });
});

test('pruneDaily removes old days and leaves everything else alone', () => {
  const storage = memory();
  storage.setItem('snake:best', '240');
  storage.setItem('snake:daily:v1:2026-10-20', JSON.stringify({ attemptsLeft: 2, best: 10, runs: 1 }));
  storage.setItem('snake:daily:v1:2026-10-13', JSON.stringify({ attemptsLeft: 0, best: 90, runs: 3 }));
  storage.setItem('snake:daily:v1:2026-09-01', JSON.stringify({ attemptsLeft: 0, best: 90, runs: 3 }));

  assert.equal(pruneDaily(storage, at(DAY), CONFIG.daily.keepDays), 1);
  assert.equal(storage.getItem('snake:best'), '240');
  assert.ok(storage.getItem('snake:daily:v1:2026-10-20'));
  assert.equal(storage.getItem('snake:daily:v1:2026-09-01'), null);
});
