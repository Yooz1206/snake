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
