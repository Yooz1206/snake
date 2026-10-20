import { CONFIG } from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;

function rgbOf(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(from, to, t) {
  const [r1, g1, b1] = rgbOf(from);
  const [r2, g2, b2] = rgbOf(to);
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`;
}

export class Renderer {
  constructor(canvas, config = CONFIG) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;
    this.palette = config.palette;
    this.particles = [];
    this.shake = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  burst(x, y, amount = 14) {
    if (this.reduced) return;
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
    if (!this.reduced) this.shake = 0.32;
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= p.decay * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  render(game, alpha, time) {
    const { ctx, size } = this;
    ctx.save();
    if (this.shake > 0) {
      const m = (this.shake / 0.32) * 6;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.fillStyle = this.palette.background;
    ctx.fillRect(-8, -8, size + 16, size + 16);
    this.grid();
    this.food(game, time);
    this.snake(game, alpha);
    this.dots();
    this.vignette();
    ctx.restore();
  }

  grid() {
    const { ctx, cell, size } = this;
    ctx.strokeStyle = this.palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < this.config.cols; i += 1) {
      const at = Math.round(i * cell) + 0.5;
      ctx.moveTo(at, 0);
      ctx.lineTo(at, size);
      ctx.moveTo(0, at);
      ctx.lineTo(size, at);
    }
    ctx.stroke();
  }

  food(game, time) {
    if (!game.food) return;
    const { ctx, cell } = this;
    const cx = (game.food.x + 0.5) * cell;
    const cy = (game.food.y + 0.5) * cell;
    const r = cell * 0.3 * (1 + Math.sin(time * 4) * 0.08);

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 1.4);
    glow.addColorStop(0, this.palette.foodGlow);
    glow.addColorStop(1, 'rgba(255,138,91,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.palette.food;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  snake(game, alpha) {
    const { ctx, cell } = this;
    const points = game.snake.map((seg, i) => {
      const before = game.prevSnake[i] ?? game.prevSnake[game.prevSnake.length - 1] ?? seg;
      return {
        x: (lerp(before.x, seg.x, alpha) + 0.5) * cell,
        y: (lerp(before.y, seg.y, alpha) + 0.5) * cell,
      };
    });

    if (points.length === 1) {
      this.head(points[0], cell, game.direction);
      return;
    }

    const last = points.length - 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = last; i > 0; i -= 1) {
      const t = i / last;
      ctx.strokeStyle = mix(this.palette.head, this.palette.tail, t);
      ctx.lineWidth = cell * (0.86 - 0.2 * t);
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i - 1].x, points[i - 1].y);
      ctx.stroke();
    }
    this.head(points[0], cell, game.direction);
  }

  head(point, cell, direction) {
    const { ctx } = this;
    const r = cell * 0.43;
    ctx.shadowColor = 'rgba(168,255,203,0.45)';
    ctx.shadowBlur = cell * 0.8;
    ctx.fillStyle = this.palette.head;
    ctx.beginPath();
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const fx = direction.x * r * 0.24;
    const fy = direction.y * r * 0.24;
    const sx = direction.y * r * 0.44;
    const sy = direction.x * r * 0.44;
    ctx.fillStyle = '#062014';
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(point.x + fx + sign * sx, point.y + fy + sign * sy, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  dots() {
    const { ctx, cell } = this;
    ctx.fillStyle = this.palette.food;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x * cell, p.y * cell, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  vignette() {
    const { ctx, size } = this;
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
}
