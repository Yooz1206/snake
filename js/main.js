import { CONFIG } from './config.js';
import { SnakeGame } from './game.js';
import { Renderer } from './renderer.js';
import { Sound } from './audio.js';
import { bindInput } from './input.js';
import { advance } from './timestep.js';

const canvas = document.getElementById('game');
const ui = {
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  overlay: document.getElementById('overlay'),
  title: document.getElementById('ov-title'),
  sub: document.getElementById('ov-sub'),
  action: document.getElementById('ov-action'),
  hint: document.getElementById('ov-hint'),
  mute: document.getElementById('mute'),
};

const BEST_KEY = 'snake:best';

const game = new SnakeGame(CONFIG);
const renderer = new Renderer(canvas, CONFIG);
const sound = new Sound();

let best = Number(localStorage.getItem(BEST_KEY) || 0);
let lastTime = performance.now();
let accumulator = 0;
let alpha = 0;
let lastStatus = '';
let lastScore = -1;

/* ---------------------------------------------------------------- overlay */

const OVERLAY = {
  ready: {
    title: '贪吃蛇',
    sub: '方向键 / WASD 控制，空格开始',
    action: '开始游戏',
    hint: '移动端可滑动屏幕操作',
  },
  paused: {
    title: '已暂停',
    sub: '深呼吸，然后继续',
    action: '继续游戏',
    hint: '空格 继续 · R 重开',
  },
  over: {
    title: '游戏结束',
    sub: '',
    action: '再来一局',
    hint: '按 R 快速重开',
  },
};

function syncOverlay() {
  if (game.status === lastStatus) return;
  lastStatus = game.status;

  if (game.status === 'running') {
    ui.overlay.classList.add('is-hidden');
    return;
  }

  const copy = OVERLAY[game.status];
  if (!copy) return;

  ui.title.textContent = copy.title;
  ui.sub.textContent = game.status === 'over'
    ? `本局 ${game.score} 分 · 历史最高 ${best}`
    : copy.sub;
  ui.action.textContent = copy.action;
  ui.hint.textContent = copy.hint;
  ui.overlay.dataset.state = game.status;
  ui.overlay.classList.remove('is-hidden');
}

/* ------------------------------------------------------------------- hud */

function syncHud() {
  if (game.score === lastScore) return;
  lastScore = game.score;
  ui.score.textContent = String(game.score);
  ui.best.textContent = String(best);
}

function commitBest() {
  if (game.score > best) {
    best = game.score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  ui.best.textContent = String(best);
}

/* ---------------------------------------------------------------- events */

function consumeEvents() {
  for (const event of game.drainEvents()) {
    if (event.type === 'eat') {
      sound.eat();
      renderer.burst(event.at.x + 0.5, event.at.y + 0.5);
    } else if (event.type === 'die') {
      sound.die();
      renderer.triggerShake();
      commitBest();
    } else if (event.type === 'start') {
      sound.start();
    }
  }
}

/* ---------------------------------------------------------------- actions */

function primaryAction() {
  switch (game.status) {
    case 'ready':
      game.start();
      break;
    case 'running':
      game.pause();
      break;
    case 'paused':
      game.resume();
      break;
    case 'over':
      game.restart();
      accumulator = 0;
      alpha = 0;
      break;
    default:
      break;
  }
  consumeEvents();
}

function handleDirection(direction) {
  if (game.status === 'ready') game.start();
  if (game.status === 'running') game.queueDirection(direction);
  consumeEvents();
}

function toggleMute() {
  const enabled = sound.toggle();
  ui.mute.textContent = enabled ? '🔊' : '🔇';
  ui.mute.setAttribute('aria-pressed', String(!enabled));
}

/* ------------------------------------------------------------------ loop */

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (game.status === 'running') {
    const result = advance(accumulator, dt, game.interval);
    accumulator = result.accumulator;

    for (let step = 0; step < result.steps && game.status === 'running'; step += 1) {
      game.step();
      consumeEvents();
    }

    if (game.status === 'running') {
      alpha = Math.min(accumulator / (game.interval / 1000), 1);
    }
  }

  renderer.update(dt);
  renderer.render(game, alpha, now / 1000);
  syncHud();
  syncOverlay();

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------- wire */

ui.action.addEventListener('click', primaryAction);
ui.mute.addEventListener('click', toggleMute);
ui.mute.textContent = sound.enabled ? '🔊' : '🔇';
ui.best.textContent = String(best);

bindInput({
  canvas,
  onDirection: handleDirection,
  onPrimary: primaryAction,
  onRestart: () => {
    game.restart();
    accumulator = 0;
    alpha = 0;
    consumeEvents();
  },
  onMute: toggleMute,
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

syncOverlay();
requestAnimationFrame(frame);
