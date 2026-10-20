import { CONFIG } from './config.js';
export function shouldPauseOnBlur(blurredAt, now, debounceMs = CONFIG.blurDebounceMs) {
  return now - blurredAt >= debounceMs;
}
export function countdownLeavesExceeded(leaves, limit = CONFIG.countdownLeaveLimit) {
  return leaves > limit;
}
export function countdownValue(elapsedMs, seconds = CONFIG.countdown.seconds, stepMs = CONFIG.countdown.stepMs) {
  if (elapsedMs < 0) return seconds;
  const shown = seconds - Math.floor(elapsedMs / stepMs);
  return shown > 0 ? shown : 0;
}
