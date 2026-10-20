export const CONFIG = Object.freeze({
  cols: 24,
  rows: 24,
  startLength: 4,
  baseInterval: 130,
  minInterval: 72,
  speedStep: 3.5,
  scorePerFood: 10,
  maxInputQueue: 2,
  restartGuardMs: 2000,
  blurDebounceMs: 100,
  countdownLeaveLimit: 3,
  daily: Object.freeze({ attempts: 3, keepDays: 7, seedPrefix: 'snake:v1:', minScoreForStreak: 10 }),
  countdown: Object.freeze({ seconds: 3, stepMs: 400 }),
  share: Object.freeze({ width: 1080, height: 1350 }),
  pwa: Object.freeze({ cache: 'snake-v1.1.0' }),
  iosTip: Object.freeze({ days: 7 }),
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
