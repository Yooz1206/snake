import { DIRECTIONS } from './config.js';

export class SnakeGame {
  constructor(config, rng = Math.random) {
    this.config = config;
    this.rng = typeof rng === 'function' ? rng : Math.random;
    this.runDate = null;
    this.reset();
  }

  reset() {
    const { cols, rows, startLength, baseInterval } = this.config;
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    this.snake = Array.from({ length: startLength }, (_, i) => ({ x: cx - i, y: cy }));
    this.prevSnake = this.snake.map((s) => ({ ...s }));
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

  get head() { return this.snake[0]; }
  get length() { return this.snake.length; }

  spawnFood() {
    const { cols, rows } = this.config;
    const taken = new Set(this.snake.map((s) => `${s.x},${s.y}`));
    const free = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (!taken.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    return free[Math.floor(this.rng() * free.length)];
  }

  queueDirection(name) {
    const next = DIRECTIONS[name];
    if (!next) return false;
    const ref = this.pending.length > 0 ? this.pending[this.pending.length - 1] : this.direction;
    if (next.x === -ref.x && next.y === -ref.y) return false;
    if (next.x === ref.x && next.y === ref.y) return false;
    if (this.pending.length >= this.config.maxInputQueue) return false;
    this.pending.push(next);
    return true;
  }

  startDaily(runDate) { this.runDate = runDate; }

  start() {
    if (this.status === 'ready') {
      this.status = 'running';
      this.events.push({ type: 'start' });
    } else if (this.status === 'over' || this.status === 'won') {
      this.restart();
    }
  }

  pause() { if (this.status === 'running') this.status = 'paused'; }
  resume() { if (this.status === 'paused') this.status = 'running'; }
  beginCountdown() { if (this.status === 'paused') this.status = 'countdown'; }
  endCountdown() { if (this.status === 'countdown') this.status = 'running'; }

  quit(reason = 'quit') {
    if (this.status === 'ready' || this.status === 'over' || this.status === 'won') return;
    this.status = 'over';
    this.events.push({ type: 'die', reason });
  }

  pressRestart(now, isDaily = false) {
    if (this.status === 'running') {
      this.status = 'paused';
      this.restartArmedAt = now;
      return 'paused';
    }
    if (this.status !== 'paused') return 'ignored';
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

  restart() {
    this.reset();
    this.status = 'running';
    this.events.push({ type: 'start' });
  }

  step() {
    if (this.status !== 'running') return;
    if (this.pending.length > 0) this.direction = this.pending.shift();

    const head = this.snake[0];
    const next = { x: head.x + this.direction.x, y: head.y + this.direction.y };
    const { cols, rows } = this.config;
    const wall = next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows;
    const grow = this.food !== null && next.x === this.food.x && next.y === this.food.y;
    const body = grow ? this.snake : this.snake.slice(0, -1);
    const self = body.some((s) => s.x === next.x && s.y === next.y);

    this.prevSnake = this.snake.map((s) => ({ ...s }));

    if (wall || self) {
      this.status = 'over';
      this.events.push({ type: 'die', reason: wall ? 'wall' : 'self' });
      return;
    }

    this.snake = grow
      ? [{ ...next }, ...this.snake]
      : [{ ...next }, ...this.snake.slice(0, -1)];

    if (!grow) return;

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

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
