/**
 * Daily-challenge state (PRD §7.1, §10.3).
 *
 * Everything here is either pure or takes a `Storage`-like object, so the
 * whole file runs under `node --test` without a browser. Storage failures
 * are never fatal: a private-mode tab or a full quota degrades to in-memory
 * defaults, which is what the spec asks for (R1.10, 7.0.3).
 */
import { CONFIG } from './config.js';

const DAILY_PREFIX = 'snake:daily:v1:';
const STREAK_KEY = 'snake:streak:v1';
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value ?? Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function startOfDay(date) {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Parse `YYYY-MM-DD` into a local date, or null when it is not a real day. */
function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const isReal = date.getFullYear() === Number(year)
    && date.getMonth() === Number(month) - 1
    && date.getDate() === Number(day);
  return isReal ? date : null;
}

function readJSON(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    if (typeof raw !== 'string' || raw === '') return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

/** @returns {string} local calendar day, `YYYY-MM-DD` */
export function dateKey(date = new Date()) {
  const value = toDate(date);
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

/** @returns {string} the local calendar day before `date` */
export function yesterdayKey(date = new Date()) {
  const value = new Date(startOfDay(toDate(date)).getTime());
  value.setDate(value.getDate() - 1);
  return dateKey(value);
}

/** @returns {{ attemptsLeft: number, best: number, runs: number }} */
export function defaultDay() {
  return { attemptsLeft: CONFIG.daily.attempts, best: 0, runs: 0 };
}

/** Clamp a stored record to the documented ranges (10.3). */
export function normaliseDay(record) {
  const state = defaultDay();
  if (!record || typeof record !== 'object') return state;

  state.attemptsLeft = clampInt(record.attemptsLeft, 0, CONFIG.daily.attempts, CONFIG.daily.attempts);
  state.best = clampInt(record.best, 0, Number.MAX_SAFE_INTEGER, 0);
  state.runs = clampInt(record.runs, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
}

/** Load today's record, or the defaults when it is missing or broken. */
export function loadDay(storage, date = new Date()) {
  return normaliseDay(readJSON(storage, DAILY_PREFIX + dateKey(date)));
}

/** Persist today's record. Returns false instead of throwing (R1.10). */
export function saveDay(storage, date, state) {
  return writeJSON(storage, DAILY_PREFIX + dateKey(date), normaliseDay(state));
}

/**
 * Settle a finished run: one attempt spent, best raised, run counted.
 * Pure — the caller decides when to persist it.
 *
 * @param {{ attemptsLeft: number, best: number, runs: number }} state
 * @param {number} score
 */
export function finishRun(state, score) {
  const current = normaliseDay(state);
  const value = clampInt(score, 0, Number.MAX_SAFE_INTEGER, 0);
  return {
    attemptsLeft: Math.max(0, current.attemptsLeft - 1),
    best: Math.max(current.best, value),
    runs: current.runs + 1,
  };
}

/** @returns {{ count: number, lastDate: string }} */
export function defaultStreak() {
  return { count: 0, lastDate: '' };
}

export function loadStreak(storage) {
  const record = readJSON(storage, STREAK_KEY);
  if (!record) return defaultStreak();

  const lastDate = typeof record.lastDate === 'string' && parseKey(record.lastDate) ? record.lastDate : '';
  const count = clampInt(record.count, 0, Number.MAX_SAFE_INTEGER, 0);
  return lastDate === '' ? defaultStreak() : { count, lastDate };
}

export function saveStreak(storage, state) {
  return writeJSON(storage, STREAK_KEY, state);
}

/**
 * Update the streak after a finished run (R1.7): only scores of 10 or more
 * count, a run on the same day changes nothing, yesterday extends the streak,
 * and a gap restarts it at 1.
 */
export function updateStreak(state, score, today) {
  const current = { ...state };
  if (clampInt(score, 0, Number.MAX_SAFE_INTEGER, 0) < CONFIG.daily.minScoreForStreak) return current;
  if (current.lastDate === today) return current;

  const count = current.lastDate === yesterdayKey(parseKey(today) ?? new Date())
    ? current.count + 1
    : 1;
  return { count, lastDate: today };
}

/** Streak to show in the UI: zero once it has gone stale (10.4). */
export function displayStreak(state, today) {
  if (!state) return 0;
  if (state.lastDate === today) return state.count;
  if (state.lastDate === yesterdayKey(parseKey(today) ?? new Date())) return state.count;
  return 0;
}

/**
 * Delete daily records older than `keepDays` so localStorage cannot grow
 * forever (R1.11). Never touches any other key.
 */
export function pruneDaily(storage, date = new Date(), keepDays = CONFIG.daily.keepDays) {
  if (!storage) return 0;

  let keys = [];
  try {
    const length = Number(storage.length) || 0;
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(DAILY_PREFIX)) keys.push(key);
    }
  } catch {
    return 0;
  }

  const today = startOfDay(toDate(date)).getTime();
  let removed = 0;

  for (const key of keys) {
    const day = parseKey(key.slice(DAILY_PREFIX.length));
    const ageDays = day ? Math.round((today - startOfDay(day).getTime()) / DAY_MS) : Infinity;

    if (ageDays > keepDays) {
      try {
        storage.removeItem(key);
        removed += 1;
      } catch {
        // A read-only storage keeps its stale key; harmless.
      }
    }
  }

  return removed;
}
