import { DIRECTIONS } from './config.js';

/**
 * Pure game state and rules. No DOM, no canvas, no timers — which makes the
 * whole thing unit-testable and keeps the render layer honest.
 *
 * The random source is injected so the daily challenge can replay the same
 * board from a date seed (PRD 10.1).
 */
export class SnakeGame {
  /**
   * @param {typeof import('./config.js').CONFIG} config
   * @param {() => number} rng uniform random in [0, 1)
   */
  constructor(config, rng = Math.random) {
    this.config = config;
    this.rng = typeof rng === 'function' ? rng : Math.random;
    this.runDate = null;
    this.reset();
  }

  /** Put the game back into its initial, not-yet-started state. */
  reset() {
    const { cols, rows, startLength, baseInterval } = this.config;
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    this.snake = Array.from({ length: startLength }, (_, i) => ({ x: cx - i, y: cy }));
    this.prevSnake = this.snake.map((segment) => ({ ...segment }));
    this.direction = { ...DIRECTIONS.right };
    this.pending = [];
    this.score = 0;
    this.eaten = 0;
    this.interval = baseInterval;
    this.status = 'ready';
    this.food = this.spawnFood();
    this.restartArmedAt = null;
    this.events = [];
  }

  get head() {
    return this.snake[0];
  }

  get length() {
    return this.snake.length;
  }

  /** Pick a uniformly random free cell. Returns null when the board is full. */
  spawnFood() {
    const { cols, rows } = this.config;
    const occupied = new Set(this.snake.map((segment) => `${segment.x},${segment.y}`));
    const free = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }

    if (free.length === 0) return null;
    return free[Math.floor(this.rng() * free.length)];
  }

  /**
   * Buffer a direction change.
   * Rejects reversals, no-ops, and anything beyond the queue limit, so a
   * frantic key mash can never make the snake fold into itself.
   *
   * @param {'up'|'down'|'left'|'right'} name
   * @returns {boolean} whether the input was accepted
   */
  queueDirection(name) {
    const next = DIRECTIONS[name];
    if (!next) return false;

    const reference = this.pending.length > 0
      ? this.pending[this.pending.length - 1]
      : this.direction;

    const isReversal = next.x === -reference.x && next.y === -reference.y;
    const isSame = next.x === reference.x && next.y === reference.y;
    if (isReversal || isSame) return false;
    if (this.pending.length >= this.config.maxInputQueue) return false;

    this.pending.push(next);
    return true;
  }

  /**
   * Attribute the coming run to a local calendar day. It does not change the
   * starting state — the seed already did that when the game was built.
   *
   * @param {string} runDate `YYYY-MM-DD`
   */
  startDaily(runDate) {
    this.runDate = runDate;
  }

  start() {
    if (this.status === 'ready') {
      this.status = 'running';
      this.events.push({ type: 'start' });
    } else if (this.status === 'over' || this.status === 'won') {
      this.restart();
    }
  }

  pause() {
    if (this.status === 'running') this.status = 'paused';
  }

  resume() {
    if (this.status === 'paused') this.status = 'running';
  }

  /** After an automatic pause the sim waits behind a 3-2-1 countdown. */
  beginCountdown() {
    if (this.status === 'paused') this.status = 'countdown';
  }

  endCountdown() {
    if (this.status === 'countdown') this.status = 'running';
  }

  /** End the run deliberately; the caller decides how to settle the score. */
  quit(reason = 'quit') {
    if (this.status === 'ready' || this.status === 'over' || this.status === 'won') return;
    this.status = 'over';
    this.events.push({ type: 'die', reason });
  }

  /**
   * `R` is a two-press action (R4.3): the first press pauses, a second press
   * within `restartGuardMs` restarts. Daily runs never restart this way, and
   * a late second press re-arms the guard instead of throwing the run away.
   *
   * @param {number} now milliseconds, caller's clock
   * @param {boolean} isDaily
   * @returns {'paused'|'restarted'|'ignored'}
   */
  pressRestart(now, isDaily = false) {
    if (this.status === 'running') {
      this.status = 'paused';
      this.restartArmedAt = now;
      return 'paused';
    }

    if (this.status === 'paused') {
      if (isDaily) return 'paused';

      const armed = typeof this.restartArmedAt === 'number' ? this.restartArmedAt : -Infinity;
      if (now - armed <= this.config.restartGuardMs) {
        this.restart();
        this.restartArmedAt = null;
        return 'restarted';
      }

      this.restartArmedAt = now;
      return 'paused';
    }

    return 'ignored';
  }

  restart() {
    this.reset();
    this.status = 'running';
    this.events.push({ type: 'start' });
  }

  /** Advance the simulation by exactly one cell. */
  step() {
    if (this.status !== 'running') return;

    if (this.pending.length > 0) this.direction = this.pending.shift();

    const head = this.snake[0];
    const next = { x: head.x + this.direction.x, y: head.y + this.direction.y };
    const { cols, rows } = this.config;

    const hitWall = next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows;
    const willGrow = this.food !== null && next.x === this.food.x && next.y === this.food.y;

    // The tail cell frees up on the same tick, so entering it is legal
    // unless the snake is currently growing.
    const body = willGrow ? this.snake : this.snake.slice(0, -1);
    const hitSelf = body.some((segment) => segment.x === next.x && segment.y === next.y);

    this.prevSnake = this.snake.map((segment) => ({ ...segment }));

    if (hitWall || hitSelf) {
      this.status = 'over';
      this.events.push({ type: 'die', reason: hitWall ? 'wall' : 'self' });
      return;
    }

    this.snake = willGrow
      ? [{ ...next }, ...this.snake]
      : [{ ...next }, ...this.snake.slice(0, -1)];

    if (willGrow) {
      this.eaten += 1;
      this.score += this.config.scorePerFood;
      this.interval = Math.max(
        this.config.minInterval,
        this.config.baseInterval - this.eaten * this.config.speedStep,
      );
      this.food = this.spawnFood();
      this.events.push({ type: 'eat', at: { ...next } });

      if (this.food === null) {
        this.status = 'won';
        this.events.push({ type: 'win' });
      }
    }
  }

  /** Hand buffered events to the caller and clear the buffer. */
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
