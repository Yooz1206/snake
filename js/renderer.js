import { CONFIG } from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(from, to, t) {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return `rgb(${Math.round(lerp(r1, r2, t))}, ${Math.round(lerp(g1, g2, t))}, ${Math.round(lerp(b1, b2, t))})`;
}

/**
 * Canvas renderer. Owns all visual state (particles, shake) and never mutates
 * the game 闁?it only reads. That keeps the simulation deterministic.
 */
export class Renderer {
  constructor(canvas, config = CONFIG) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;
    this.palette = config.palette;
    this.particles = [];
    this.shake = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.size = 0;
    this.cell = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.max(240, Math.floor(rect.width || this.canvas.clientWidth || 480));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.size = size;
    this.cell = size / this.config.cols;
  }

  /** Spawn a short particle burst at a board cell. */
  burst(x, y, amount = 14) {
    if (this.reducedMotion) return;
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 160;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 1.6 + Math.random() * 1.4,
        radius: 1.5 + Math.random() * 2.5,
      });
    }
  }

  triggerShake() {
    if (!this.reducedMotion) this.shake = 0.32;
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt);
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
      particle.life -= particle.decay * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  /** @param {import('./game.js').SnakeGame} game */
  render(game, alpha, time) {
    const { ctx, cell, size } = this;
    ctx.save();

    if (this.shake > 0) {
      const magnitude = (this.shake / 0.32) * 6;
      ctx.translate((Math.random() - 0.5) * magnitude, (Math.random() - 0.5) * magnitude);
    }

    ctx.fillStyle = this.palette.background;
    ctx.fillRect(-8, -8, size + 16, size + 16);

    this.drawGrid();
    this.drawFood(game, time);
    this.drawSnake(game, alpha);
    this.drawParticles();
    this.drawVignette();

    ctx.restore();
  }

  drawGrid() {
    const { ctx, cell, size } = this;
    ctx.strokeStyle = this.palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < this.config.cols; i += 1) {
      const offset = Math.round(i * cell) + 0.5;
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset, size);
      ctx.moveTo(0, offset);
      ctx.lineTo(size, offset);
    }
    ctx.stroke();
  }

  drawFood(game, time) {
    if (!game.food) return;
    const { ctx, cell } = this;
    const cx = (game.food.x + 0.5) * cell;
    const cy = (game.food.y + 0.5) * cell;
    const pulse = 1 + Math.sin(time * 4) * 0.08;
    const radius = cell * 0.3 * pulse;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 1.4);
    glow.addColorStop(0, this.palette.foodGlow);
    glow.addColorStop(1, 'rgba(255, 138, 91, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.palette.food;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // R6.6: the food carries a ring as well as a colour, so the board still
    // reads when colour is unavailable.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSnake(game, alpha) {
    const { ctx, cell } = this;
    const snake = game.snake;
    const previous = game.prevSnake;
    const last = snake.length - 1;

    // Interpolate every segment centre between its previous and current cell
    // so motion is smooth rather than a 8-cells-per-second stutter.
    const points = snake.map((segment, index) => {
      const before = previous[index] ?? previous[previous.length - 1] ?? segment;
      return {
        x: (lerp(before.x, segment.x, alpha) + 0.5) * cell,
        y: (lerp(before.y, segment.y, alpha) + 0.5) * cell,
      };
    });

    if (points.length === 1) {
      this.drawHead(points[0], cell, game.direction);
      return;
    }

    // Draw back-to-front so the head always sits on top of its neck.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = last; i > 0; i -= 1) {
      const t = i / last;
      ctx.strokeStyle = mixColor(this.palette.head, this.palette.tail, t);
      ctx.lineWidth = cell * (0.86 - 0.2 * t);
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i - 1].x, points[i - 1].y);
      ctx.stroke();
    }

    this.drawHead(points[0], cell, game.direction);
  }

  drawHead(point, cell, direction) {
    const { ctx } = this;
    const radius = cell * 0.43;

    ctx.shadowColor = 'rgba(168, 255, 203, 0.45)';
    ctx.shadowBlur = cell * 0.8;
    ctx.fillStyle = this.palette.head;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    this.drawEyes(point.x, point.y, radius, direction);
  }

  drawEyes(cx, cy, radius, direction) {
    const { ctx } = this;
    const eyeRadius = radius * 0.2;
    const forward = radius * 0.24;
    const side = radius * 0.44;

    const fx = direction.x * forward;
    const fy = direction.y * forward;
    const sx = direction.y * side;
    const sy = direction.x * side;

    ctx.fillStyle = '#062014';
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + fx + sign * sx, cy + fy + sign * sy, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles() {
    const { ctx, cell } = this;
    ctx.fillStyle = this.palette.food;
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.beginPath();
      ctx.arc(particle.x * cell, particle.y * cell, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawVignette() {
    const { ctx, size } = this;
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, size * 0.35,
      size / 2, size / 2, size * 0.75,
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
}
