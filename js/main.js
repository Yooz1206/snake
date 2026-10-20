import { CONFIG } from './config.js';
import { SnakeGame } from './game.js';
import { Renderer } from './renderer.js';
import { bindInput } from './input.js';
import { advance } from './timestep.js';
import { rngForDate } from './rng.js';

let D = null;
const dailyReady = import('./daily.js').then((mod) => {
  D = mod;
  dayState = D.loadDay(storage, new Date());
  streak = D.loadStreak(storage);
  D.pruneDaily(storage, new Date());
  paint(true);
});

const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const streakDays = () => (D ? D.displayStreak(streak, today()) : 0);

const E = (id) => document.getElementById(id);
const ui = {
  score: E('score'), best: E('best'), brand: E('brand'), overlay: E('overlay'),
  title: E('ov-title'), sub: E('ov-sub'), action: E('ov-action'), secondary: E('ov-secondary'),
  quit: E('ov-quit'), hint: E('ov-hint'), mute: E('mute'), foot: E('foot-hint'),
  live: E('live'), toast: E('toast'), count: E('countdown'), countValue: E('countdown-value'),
  iosTip: E('ios-tip'),
};
const stage = E('stage');
const canvas = E('game');

const BEST = 'snake:best', MUTED = 'snake:muted', SEEN = 'snake:seen:v1';
const IOS = 'snake:iosTipSeen:v1', FIRST = 'snake:firstSeen:v1';

const DEATH = { wall: '撞到墙了', self: '咬到自己了', quit: '你结束了本局', leave: '你离开了' };
const death = (r) => DEATH[r] ?? DEATH.wall;
const overSub = (s, r) => `本局 ${s} 分 · ${death(r)}`;
const monthDay = (d = new Date()) => `${d.getMonth() + 1}月${d.getDate()}日`;
const readyLine = (a) => `${monthDay()} · 同一开局 · 今日剩 ${a} 次`;
const footLine = (a, s) => (s > 0 ? `剩 ${a} 次 · 连续 ${s} 天` : `剩 ${a} 次`);
const overLine = (b, a) => `今日最佳 ${b} · 剩 ${a} 次`;
const doneLine = (b, s) => `最佳 ${b} 分 · 连续 ${s} 天`;

function refreshLine() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const m = Math.max(0, Math.round((end - now) / 60000));
  return `明天 00:00 刷新 · ${m >= 60 ? `还有 ${Math.floor(m / 60)} 小时 ${m % 60} 分` : `还有 ${m} 分`}`;
}

function safeStorage() {
  try {
    const probe = '__snake_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

const storage = safeStorage();
const get = (k) => { try { return storage?.getItem(k) ?? null; } catch { return null; } };
const set = (k, v) => { try { storage?.setItem(k, String(v)); return true; } catch { return false; } };
const today = () => dateKey(new Date());
const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
const isFirst = () => get(SEEN) !== '1';
const seen = () => set(SEEN, '1');

let mode = 'daily';
let game;
let renderer;
let sound = { eat() {}, die() {}, start() {}, toggle() { return true; }, enabled: true };
let muted = get(MUTED) === '1';
let dayState = { attemptsLeft: CONFIG.daily.attempts, best: 0, runs: 0 };
let streak = { count: 0, lastDate: '' };
let allBest = Number(get(BEST)) || 0;
let settled = false;
let autoPaused = false;
let countdown = { startedAt: 0, leaves: 0 };
let tickShown = 0;
let iosMod = null;
let iosShown = false;
let warned = false;
let lastTime = performance.now();
let acc = 0;
let alpha = 0;
let lastStatus = '';
let lastScore = -1;
let deathReason = 'wall';
let lastAnnounce = 0;
let focusTimer = null;
let blurTimer = null;
let blurredAt = 0;

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { ui.toast.hidden = true; }, 2600);
}

function warnOnce() {
  if (warned || !storage) return;
  warned = true;
  toast('本次记录仅保存在当前会话');
}

const announce = (text) => { ui.live.textContent = text; };

function slowAnnounce(text, gap = 10000) {
  const now = performance.now();
  if (now - lastAnnounce < gap) return;
  lastAnnounce = now;
  announce(text);
}

const firstSeen = (() => {
  const stored = Number(get(FIRST));
  if (Number.isFinite(stored) && stored > 0) return stored;
  const now = Date.now();
  set(FIRST, now);
  return now;
})();

function iosTipNow() {
  if (!iosMod || game.status !== 'ready') { ui.iosTip.hidden = true; return; }
  if (!iosShown) {
    const due = iosMod.shouldShowIosTip({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      standalone: navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
      firstSeenAt: firstSeen,
      now: Date.now(),
      seen: get(IOS) === '1',
    });
    if (!due) { ui.iosTip.hidden = true; return; }
    iosShown = true;
    ui.iosTip.textContent = iosMod.IOS_TIP_TEXT;
    set(IOS, '1');
  }
  ui.iosTip.hidden = false;
}

function hud(force = false) {
  ui.brand.textContent = mode === 'daily' ? 'DAILY' : 'SNAKE';
  if (force || game.score !== lastScore) {
    lastScore = game.score;
    ui.score.textContent = String(game.score);
  }
  ui.best.textContent = String(mode === 'daily' ? dayState.best : allBest);
}

function pulse() {
  ui.best.classList.remove('is-pulse');
  void ui.best.offsetWidth;
  ui.best.classList.add('is-pulse');
}

function build(which) {
  mode = which;
  const date = today();
  if (mode === 'daily') {
    game = new SnakeGame(CONFIG, rngForDate(date));
    game.startDaily(date);
  } else {
    game = new SnakeGame(CONFIG);
  }
  settled = false;
  acc = 0;
  alpha = 0;
  tickShown = 0;
  countdown = { startedAt: 0, leaves: 0 };
  hideCount();
  hud(true);
  paint(true);
}

function onEat(event) {
  sound.eat();
  renderer.burst(event.at.x + 0.5, event.at.y + 0.5);
  if (game.score > allBest) {
    allBest = game.score;
    if (!set(BEST, allBest)) warnOnce();
    if (mode === 'daily') {
      dayState = { ...dayState, best: Math.max(dayState.best, game.score) };
      D?.saveDay(storage, new Date(`${game.runDate}T12:00:00`), dayState);
    }
    pulse();
    slowAnnounce(`新纪录，当前分数 ${game.score}`);
  }
  hud();
}

function settle(reason) {
  if (settled) return;
  settled = true;
  if (!D) return;

  const score = game.score;
  const runDate = game.runDate ?? today();
  const runDateObj = new Date(`${runDate}T12:00:00`);

  if (mode === 'daily') {
    const next = D.finishRun(D.loadDay(storage, runDateObj), score);
    if (!D.saveDay(storage, runDateObj, next)) warnOnce();
    dayState = runDate === today() ? next : D.loadDay(storage);
  }

  if (score > allBest) {
    allBest = score;
    set(BEST, allBest);
  }

  const updated = D.updateStreak(D.loadStreak(storage), score, runDate);
  if (updated.count !== streak.count || updated.lastDate !== streak.lastDate) {
    D.saveStreak(storage, updated);
    streak = updated;
  }

  if (mode !== 'daily') return;
  const left = dayState.attemptsLeft;
  announce(left > 0
    ? `游戏结束，本局 ${score} 分，${death(reason)}。今日剩余 ${left} 次`
    : '今日挑战已完成，明天零点刷新');
}

function onDied(reason) {
  sound.die();
  renderer.triggerShake();
  settle(reason);
  deathReason = reason;
  paint(true);
}

function pump() {
  for (const event of game.drainEvents()) {
    if (event.type === 'eat') onEat(event);
    else if (event.type === 'die') onDied(event.reason);
    else if (event.type === 'win') { sound.start(); settle('win'); paint(true); }
    else if (event.type === 'start') sound.start();
  }
}

function showCount() {
  ui.count.hidden = false;
  ui.countValue.textContent = String(CONFIG.countdown.seconds);
  tickShown = CONFIG.countdown.seconds;
}

function hideCount() {
  ui.count.hidden = true;
  tickShown = 0;
}

function setBtn(button, label) {
  button.textContent = label ?? '';
  button.hidden = !label;
}

function focusBtn() {
  if (game.status === 'running') return;
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => {
    if (game.status !== 'running' && !ui.action.hidden) ui.action.focus({ preventScroll: true });
  }, 60);
}

function copyFor() {
  const daily = mode === 'daily';
  const attempts = dayState.attemptsLeft;
  const days = streakDays();
  const touch = isTouch();

  if (game.status === 'ready') {
    if (daily && attempts > 0) {
      const bits = [days > 0 ? `连续 ${days} 天` : '', dayState.best > 0 ? `今日最佳 ${dayState.best}` : ''];
      return {
        title: '每日挑战',
        sub: readyLine(attempts),
        action: '开始今日挑战',
        secondary: '练习模式',
        hint: bits.filter(Boolean).join(' · ') || (touch ? '滑动或点按开始' : '方向键 / WASD 开始'),
      };
    }
    if (daily) {
      return {
        title: '今日完成',
        sub: doneLine(dayState.best, days),
        action: dayState.best > 0 ? '分享战绩' : '练习模式',
        secondary: '练习模式',
        hint: refreshLine(),
      };
    }
    return {
      title: '贪吃蛇',
      sub: touch ? '滑动或点按开始' : (isFirst() ? '方向键 / WASD 开始' : '方向键 / WASD 控制，空格开始'),
      action: '开始游戏',
      secondary: '每日挑战',
      hint: touch ? '移动端可滑动屏幕操作' : '空格 开始 · 方向键 / WASD 转向',
    };
  }

  if (game.status === 'paused') {
    return {
      title: '已暂停',
      sub: '深呼吸，然后继续',
      action: '继续游戏',
      secondary: daily ? null : '重新开始',
      extra: daily ? '结束本局' : null,
      hint: daily ? '空格 继续 · R 无效' : '空格 继续 · R 重开',
    };
  }

  if (game.status === 'won') {
    return {
      title: '完美通关',
      sub: `${CONFIG.cols * CONFIG.rows} 格 · ${game.score} 分`,
      action: '再来一局',
      secondary: daily ? '分享战绩' : '每日挑战',
      hint: '',
    };
  }

  if (game.status === 'over') {
    if (daily && attempts === 0) {
      return { title: '今日完成', sub: doneLine(dayState.best, days), action: '分享战绩', secondary: '练习模式', hint: refreshLine() };
    }
    return {
      title: '游戏结束',
      sub: daily
        ? `${overSub(game.score, deathReason)} · ${overLine(dayState.best, attempts)}`
        : overSub(game.score, deathReason),
      action: daily ? `再来一局（剩 ${attempts} 次）` : '再来一局',
      secondary: daily ? '分享战绩' : '每日挑战',
      hint: daily ? '每天 3 次机会' : '按 R 快速重开',
    };
  }

  return { title: '', sub: '', action: null, secondary: null, extra: null, hint: '' };
}

function paint(force = false) {
  iosTipNow();
  if (!force && game.status === lastStatus && game.status === 'running') return;
  lastStatus = game.status;

  const visible = game.status !== 'running';
  ui.overlay.classList.toggle('is-hidden', !visible);
  ui.overlay.dataset.state = game.status;

  if (!visible) {
    if (game.status === 'countdown') showCount();
    return;
  }

  const copy = copyFor();
  ui.title.textContent = copy.title;
  ui.sub.textContent = copy.sub;
  setBtn(ui.action, copy.action);
  setBtn(ui.secondary, copy.secondary);
  setBtn(ui.quit, copy.extra);
  ui.hint.textContent = copy.hint;
  ui.foot.textContent = mode === 'daily'
    ? footLine(dayState.attemptsLeft, streakDays())
    : '空格 暂停 · R 重开';

  if (game.status !== 'countdown') hideCount();
  focusBtn();
}

function begin(which = mode) {
  if (!D) { dailyReady.then(() => begin(which)); return; }
  if (which !== mode) build(which);

  if (mode === 'daily') {
    dayState = D.loadDay(storage, new Date());
    if (dayState.attemptsLeft <= 0) { paint(true); return; }
    game = new SnakeGame(CONFIG, rngForDate(today()));
    game.startDaily(today());
    settled = false;
    acc = 0;
    alpha = 0;
    game.start();
    announce(`每日挑战开始，今天剩余 ${dayState.attemptsLeft} 次机会`);
  } else {
    game.start();
  }

  seen();
  pump();
  paint(true);
}

function resume() {
  if (!autoPaused) {
    game.resume();
    acc = 0;
    alpha = 0;
    return;
  }
  autoPaused = false;
  countdown = { startedAt: performance.now(), leaves: 0 };
  game.beginCountdown();
  showCount();
}

function primary() {
  if (game.status === 'ready') begin();
  else if (game.status === 'running') { game.pause(); autoPaused = false; }
  else if (game.status === 'paused') resume();
  else if (game.status === 'over' || game.status === 'won') {
    if (mode === 'daily' && dayState.attemptsLeft <= 0) shareCard();
    else begin();
  }
  pump();
  paint(true);
}

function turn(direction) {
  if (game.status === 'ready') begin();
  if (game.status === 'running') game.queueDirection(direction);
  pump();
  paint();
}

async function shareCard() {
  const runDate = game.runDate ?? today();
  const best = mode === 'daily' ? Math.max(dayState.best, game.score) : Math.max(allBest, game.score);
  if (best <= 0) { toast('本局还没有分数'); return; }

  const days = streakDays();
  const attempt = mode === 'daily' ? Math.max(1, dayState.runs) : 1;
  const url = new URL(location.href);
  url.search = '?from=share';

  try {
    const { shareCopy, cardFileName, shareResult, drawCard } = await import('./share.js');
    const copy = shareCopy({ date: runDate, best, streak: days, attempt, url: String(url) });
    let blob = null;
    try {
      const card = document.createElement('canvas');
      card.width = CONFIG.share.width;
      card.height = CONFIG.share.height;
      drawCard(card.getContext('2d'), {
        width: CONFIG.share.width, height: CONFIG.share.height, date: runDate,
        best, streak: days, attempt, url: String(url), palette: CONFIG.palette,
      });
      blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'));
    } catch {
      blob = null;
    }

    const outcome = await shareResult({ copy, fileName: cardFileName({ date: runDate, best }), blob });
    if (outcome === 'shared') announce('战绩卡已生成');
    else if (outcome === 'downloaded') toast('已下载战绩卡');
    else if (outcome === 'copied') toast('战绩卡生成失败，已复制文案');
    else if (outcome === 'failed') toast('分享失败，请稍后再试');
  } catch {
    toast('分享卡生成失败，已复制文案');
  }
}

function muteToggle() {
  muted = !muted;
  sound.toggle();
  ui.mute.textContent = muted ? '🔇' : '🔊';
  ui.mute.setAttribute('aria-pressed', String(muted));
  set(MUTED, muted ? '1' : '0');
}

function quitRun() {
  if (game.status !== 'paused' && game.status !== 'countdown') return;
  game.quit('quit');
  pump();
  paint(true);
}

function tick() {
  const left = CONFIG.countdown.seconds - Math.floor((performance.now() - countdown.startedAt) / CONFIG.countdown.stepMs);
  const value = left > 0 ? left : 0;
  if (value !== tickShown) {
    tickShown = value;
    ui.countValue.textContent = String(Math.max(1, value));
  }
  if (value === 0) {
    game.endCountdown();
    hideCount();
    acc = 0;
    alpha = 0;
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (game.status === 'countdown') tick();

  if (game.status === 'running') {
    const result = advance(acc, dt, game.interval);
    acc = result.accumulator;
    for (let step = 0; step < result.steps && game.status === 'running'; step += 1) {
      game.step();
      pump();
    }
    if (game.status === 'running') alpha = Math.min(acc / (game.interval / 1000), 1);
  }

  renderer.update(dt);
  renderer.render(game, alpha, now / 1000);
  hud();
  paint();
  requestAnimationFrame(frame);
}

function pauseHidden() {
  if (game.status === 'countdown') {
    countdown.leaves += 1;
    if (countdown.leaves > CONFIG.countdownLeaveLimit) {
      game.quit('leave');
      settle('leave');
      pump();
      paint(true);
      return;
    }
    countdown.startedAt = performance.now();
    tickShown = 0;
    return;
  }

  if (game.status === 'running') {
    game.pause();
    autoPaused = true;
    paint(true);
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseHidden(); });

window.addEventListener('blur', () => {
  blurredAt = performance.now();
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    if (performance.now() - blurredAt >= CONFIG.blurDebounceMs) pauseHidden();
  }, CONFIG.blurDebounceMs);
});

window.addEventListener('focus', () => clearTimeout(blurTimer));

renderer = new Renderer(canvas, CONFIG);
build('daily');

ui.action.addEventListener('click', primary);
ui.secondary.addEventListener('click', () => {
  const label = ui.secondary.textContent;
  if (label === '练习模式') begin('practice');
  else if (label === '每日挑战') begin('daily');
  else if (label === '分享战绩') shareCard();
  else if (label === '重新开始') {
    game.restart();
    acc = 0;
    alpha = 0;
    pump();
    paint(true);
  }
});
ui.quit.addEventListener('click', quitRun);
ui.mute.addEventListener('click', muteToggle);

stage.addEventListener('click', (event) => {
  if (event.target.closest('button')) return;
  if (game.status === 'ready') primary();
});

bindInput({
  canvas: stage,
  onDirection: turn,
  onPrimary: primary,
  onRestart: () => {
    const outcome = game.pressRestart(performance.now(), mode === 'daily');
    if (outcome === 'restarted') {
      acc = 0;
      alpha = 0;
    } else if (outcome === 'paused' && mode !== 'daily') {
      toast('再按 R 重开');
    }
    pump();
    paint(true);
  },
  onMute: muteToggle,
});

ui.mute.textContent = muted ? '🔇' : '🔊';
ui.mute.setAttribute('aria-pressed', String(muted));
if (isFirst()) seen();

import('./audio.js').then(({ Sound }) => {
  sound = new Sound();
  if (muted) sound.toggle();
}).catch(() => {});

import('./ios.js').then((mod) => {
  iosMod = mod;
  iosTipNow();
}).catch(() => {});

setTimeout(() => {
  import('./pwa.js')
    .then(({ registerServiceWorker }) => registerServiceWorker({ onUpdate: () => toast('新版本已就绪，刷新后生效') }))
    .catch(() => {});
}, 1200);

requestAnimationFrame(frame);
