/**
 * Seeded randomness for the daily challenge (PRD §10.4).
 *
 * The whole point of this module is reproducibility: the same date must give
 * the same seed on every device, and the same seed must replay the same
 * number sequence. Both algorithms are fixed by the spec — do not "improve"
 * them, or every player's daily run changes.
 */
import { CONFIG } from './config.js';

/**
 * FNV-1a, 32 bit. Same output in every JS engine because it stays in int32
 * via Math.imul.
 *
 * @param {string} str
 * @returns {number} unsigned 32-bit hash
 */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32: tiny, fast, and good enough for a snake board.
 *
 * @param {number} seed
 * @returns {() => number} generator in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seed for a local calendar day, e.g. `2026-10-20`.
 *
 * @param {string} date `YYYY-MM-DD`
 * @returns {number}
 */
export function seedForDate(date) {
  return fnv1a32(`${CONFIG.daily.seedPrefix}${date}`);
}

/**
 * A fresh generator for a calendar day. Each attempt gets its own generator
 * so retrying a day replays the same board.
 *
 * @param {string} date `YYYY-MM-DD`
 * @returns {() => number}
 */
export function rngForDate(date) {
  return mulberry32(seedForDate(date));
}
