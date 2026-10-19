import { DIRECTIONS } from './config.js';

/**
 * Pure game state and rules. No DOM, no canvas, no timers — which makes the
 * whole thing unit-testable and keeps the render layer honest.
 */
export class SnakeGame {
  /**
   * @param {typeof import('./config.js').CONFIG} config
   */
  constructor(config) {
    this.config = config;
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
    return free[Math.floor(Math.random() * free.length)];
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

  start() {
    if (this.status === 'ready') {
      this.status = 'running';
      this.events.push({ type: 'start' });
    } else if (this.status === 'over') {
      this.restart();
    }
  }

  pause() {
    if (this.status === 'running') this.status = 'paused';
  }

  resume() {
    if (this.status === 'paused') this.status = 'running';
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
    }
  }

  /** Hand buffered events to the caller and clear the buffer. */
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
