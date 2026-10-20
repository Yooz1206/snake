/**
 * Game configuration. Everything tunable lives here so the feel of the game
 * can be adjusted without touching logic or rendering code.
 */
export const CONFIG = Object.freeze({
  /** Board size in cells. */
  cols: 24,
  rows: 24,

  /** Starting snake length. */
  startLength: 4,

  /** Milliseconds per cell at the start. */
  baseInterval: 130,

  /** Fastest the snake is allowed to become. */
  minInterval: 72,

  /** Speed gained per food eaten (ms shaved off the interval). */
  speedStep: 3.5,

  /** Points awarded per food. */
  scorePerFood: 10,

  /** How many direction changes may be buffered ahead. */
  maxInputQueue: 2,

  /** A second restart press inside this window restarts the run. */
  restartGuardMs: 2000,

  /** Debounce for the window blur pause. */
  blurDebounceMs: 100,

  /** Leaving the tab during the countdown more than this many times ends the run. */
  countdownLeaveLimit: 3,

  /** Daily challenge rules (PRD §7.1). */
  daily: Object.freeze({
    attempts: 3,
    keepDays: 7,
    seedPrefix: 'snake:v1:',
    minScoreForStreak: 10,
  }),

  /** 3-2-1 resume countdown (PRD 7.0.2). */
  countdown: Object.freeze({
    seconds: 3,
    stepMs: 400,
  }),

  /** Share card size (PRD R2.3). */
  share: Object.freeze({
    width: 1080,
    height: 1350,
  }),

  /** Service worker cache name; bump with the release (PRD 10.5). */
  pwa: Object.freeze({
    cache: 'snake-v1.1.0',
  }),

  /** Board colours, used by the renderer. */
  palette: Object.freeze({
    background: '#0a0d12',
    grid: 'rgba(124, 255, 178, 0.07)',
    head: '#b8ffd4',
    tail: '#2a8a5f',
    food: '#ff9a6b',
    foodGlow: 'rgba(255, 138, 91, 0.45)',
  }),
});

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 }),
});
