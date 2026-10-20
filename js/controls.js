/**
 * Tiny pure decisions behind the DOM wiring. They live here so the rules can
 * be tested without a browser: `main.js` stays a thin adapter.
 */
import { CONFIG } from './config.js';

/**
 * A blur only pauses once it has lasted the debounce window, so opening the
 * browser's own UI does not freeze the run mid-swipe (R4.6).
 */
export function shouldPauseOnBlur(blurredAt, now, debounceMs = CONFIG.blurDebounceMs) {
  return now - blurredAt >= debounceMs;
}

/**
 * Repeatedly leaving the tab during the countdown is treated as idling, not
 * as invulnerability (R4.11).
 */
export function countdownLeavesExceeded(leaves, limit = CONFIG.countdownLeaveLimit) {
  return leaves > limit;
}

/**
 * Which number the 3-2-1 overlay shows, given elapsed milliseconds.
 * Returns 0 when the countdown is over.
 */
export function countdownValue(elapsedMs, seconds = CONFIG.countdown.seconds, stepMs = CONFIG.countdown.stepMs) {
  if (elapsedMs < 0) return seconds;
  const shown = seconds - Math.floor(elapsedMs / stepMs);
  return shown > 0 ? shown : 0;
}
