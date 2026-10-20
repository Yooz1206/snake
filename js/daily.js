import { CONFIG } from './config.js';

const PREFIX = 'snake:daily:v1:';
const STREAK = 'snake:streak:v1';
const MS_DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const startOf = (date) => {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const date = new Date(y, mo - 1, d);
  const real = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
  return real ? date : null;
}

function read(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    if (typeof raw !== 'string' || raw === '') return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function int(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function dateKey(date = new Date()) {
  return keyOf(toDate(date));
}

export function yesterdayKey(date = new Date()) {
  const value = startOf(toDate(date));
  value.setDate(value.getDate() - 1);
  return keyOf(value);
}

export function defaultDay() {
  return { attemptsLeft: CONFIG.daily.attempts, best: 0, runs: 0 };
}

export function normaliseDay(record) {
  const state = defaultDay();
  if (!record || typeof record !== 'object') return state;
  state.attemptsLeft = int(record.attemptsLeft, 0, CONFIG.daily.attempts, CONFIG.daily.attempts);
  state.best = int(record.best, 0, Number.MAX_SAFE_INTEGER, 0);
  state.runs = int(record.runs, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
}

export function loadDay(storage, date = new Date()) {
  return normaliseDay(read(storage, PREFIX + dateKey(date)));
}

export function saveDay(storage, date, state) {
  return write(storage, PREFIX + dateKey(date), normaliseDay(state));
}

export function finishRun(state, score) {
  const current = normaliseDay(state);
  const value = int(score, 0, Number.MAX_SAFE_INTEGER, 0);
  return {
    attemptsLeft: Math.max(0, current.attemptsLeft - 1),
    best: Math.max(current.best, value),
    runs: current.runs + 1,
  };
}

export function defaultStreak() {
  return { count: 0, lastDate: '' };
}

export function loadStreak(storage) {
  const record = read(storage, STREAK);
  if (!record) return defaultStreak();
  const lastDate = typeof record.lastDate === 'string' && parseKey(record.lastDate) ? record.lastDate : '';
  if (!lastDate) return defaultStreak();
  return { count: int(record.count, 0, Number.MAX_SAFE_INTEGER, 0), lastDate };
}

export function saveStreak(storage, state) {
  return write(storage, STREAK, state);
}

export function updateStreak(state, score, today) {
  const current = { ...state };
  if (int(score, 0, Number.MAX_SAFE_INTEGER, 0) < CONFIG.daily.minScoreForStreak) return current;
  if (current.lastDate === today) return current;
  const yesterday = yesterdayKey(parseKey(today) ?? new Date());
  return { count: current.lastDate === yesterday ? current.count + 1 : 1, lastDate: today };
}

export function displayStreak(state, today) {
  if (!state) return 0;
  if (state.lastDate === today) return state.count;
  return state.lastDate === yesterdayKey(parseKey(today) ?? new Date()) ? state.count : 0;
}

export function pruneDaily(storage, date = new Date(), keepDays = CONFIG.daily.keepDays) {
  if (!storage) return 0;

  const keys = [];
  try {
    const length = Number(storage.length) || 0;
    for (let i = 0; i < length; i += 1) {
      const key = storage.key(i);
      if (typeof key === 'string' && key.startsWith(PREFIX)) keys.push(key);
    }
  } catch {
    return 0;
  }

  const today = startOf(toDate(date)).getTime();
  let removed = 0;

  for (const key of keys) {
    const day = parseKey(key.slice(PREFIX.length));
    const age = day ? Math.round((today - startOf(day).getTime()) / MS_DAY) : Infinity;
    if (age <= keepDays) continue;
    try {
      storage.removeItem(key);
      removed += 1;
    } catch {
      // A read-only storage keeps its stale key; harmless.
    }
  }

  return removed;
}
