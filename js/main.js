import { CONFIG } from './config.js';
import { SnakeGame } from './game.js';
import { Renderer } from './renderer.js';
import { Sound } from './audio.js';
import { bindInput } from './input.js';
import { advance } from './timestep.js';
import {
  dateKey,
  loadDay,
  saveDay,
  finishRun,
  loadStreak,
  saveStreak,
  updateStreak,
  displayStreak,
  pruneDaily,
} from './daily.js';
import { rngForDate } from './rng.js';
import {
  overSubtitle,
  dailyReadyLine,
  dailyFooter,
  dailyOverLine,
  dailyDoneLine,
  refreshLine,
  monthDay,
} from './copy.js';
import { shouldPauseOnBlur, countdownLeavesExceeded, countdownValue } from './controls.js';
import { registerServiceWorker } from './pwa.js';

/* --------------------------------------------------------------- elements */

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const ui = {
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  brand: document.getElementById('brand'),
  overlay: document.getElementById('overlay'),
  title: document.getElementById('ov-title'),
  sub: document.getElementById('ov-sub'),
  action: document.getElementById('ov-action'),
  secondary: document.getElementById('ov-secondary'),
  quit: document.getElementById('ov-quit'),
  hint: document.getElementById('ov-hint'),
  mute: document.getElementById('mute'),
  foot: document.getElementById('foot-hint'),
  live: document.getElementById('live'),
  toast: document.getElementById('toast'),
  countdown: document.getElementById('countdown'),
  countdownValue: document.getElementById('countdown-value'),
  iosTip: document.getElementById('ios-tip'),
};

const BEST_KEY = 'snake:best';
const MUTED_KEY = 'snake:muted';
const SEEN_KEY = 'snake:seen:v1';
const IOS_TIP_KEY = 'snake:iosTipSeen:v1';
const FIRST_SEEN_KEY = 'snake:firstSeen:v1';

/* ---------------------------------------------------------------- storage */

function safeStorage() {
  try {
    const probe = '__snake_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = safeStorage();

function readNumber(key) {
  try {
    return Number(storage?.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key, value) {
  try {
    storage?.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

let storageWarned = false;
function warnStorageOnce() {
  if (storageWarned || !storage) return;
  storageWarned = true;
  toast('本次记录仅保存在当前会话');
}

/* ------------------------------------------------------------------ state */

const today = () => dateKey(new Date());

let mode = 'daily';
let game;
let renderer;
let sound;
let dayState = { attemptsLeft: CONFIG.daily.attempts, best: 0, runs: 0 };
let streak = { count: 0, lastDate: '' };
let allTimeBest = readNumber(BEST_KEY);
let settled = false;
let autoPaused = false;
let countdown = { startedAt: 0, leaves: 0 };
let lastCountdownShown = 0;
let showIosTip = false;

let lastTime = performance.now();
let accumulator = 0;
let alpha = 0;
let lastStatus = '';
let lastScore = -1;

/* ------------------------------------------------------------------ setup */

function touchLike() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function firstVisit() {
  try {
    return storage?.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    storage?.setItem(SEEN_KEY, '1');
  } catch {
    // Non-fatal: the player just sees the intro again next time.
  }
}

function newGame(which) {
  mode = which;
  const date = today();

  if (mode === 'daily') {
    game = new SnakeGame(CONFIG, rngForDate(date));
    game.startDaily(date);
  } else {
    game = new SnakeGame(CONFIG);
  }

  settled = false;
  accumulator = 0;
  alpha = 0;
  lastCountdownShown = 0;
  countdown = { startedAt: 0, leaves: 0 };
  hideCountdown();
  syncHud(true);
  renderOverlay(true);
}

/* ------------------------------------------------------------------- hud */

function syncHud(force = false) {
  const best = mode === 'daily' ? dayState.best : allTimeBest;
  ui.brand.textContent = mode === 'daily' ? 'DAILY' : 'SNAKE';

  if (force || game.score !== lastScore) {
    lastScore = game.score;
    ui.score.textContent = String(game.score);
  }
  ui.best.textContent = String(best);
}

function pulseHud() {
  ui.best.classList.remove('is-pulse');
  // Force a reflow so the animation can restart on consecutive records.
  void ui.best.offsetWidth;
  ui.best.classList.add('is-pulse');
}

/* ------------------------------------------------------------ announcements */

let lastAnnounce = 0;

function announce(text) {
  ui.live.textContent = text;
}

function announceThrottled(text, gapMs = 10000) {
  const now = performance.now();
  if (now - lastAnnounce < gapMs) return;
  lastAnnounce = now;
  announce(text);
}

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { ui.toast.hidden = true; }, 2600);
}

/* ------------------------------------------------------------------ score */

function onEat(event) {
  sound.eat();
  renderer.burst(event.at.x + 0.5, event.at.y + 0.5);

  // R4.1: a record is persisted the moment it happens, not on death.
  if (game.score > allTimeBest) {
    allTimeBest = game.score;
    if (!writeNumber(BEST_KEY, allTimeBest)) warnStorageOnce();
    if (mode === 'daily') {
      const next = { ...dayState, best: Math.max(dayState.best, game.score) };
      dayState = next;
      saveDay(storage, new Date(`${game.runDate}T12:00:00`), next);
    }
    pulseHud();
    announceThrottled(`新纪录，当前分数 ${game.score}`);
  }

  syncHud();
}

function consumeEvents() {
  for (const event of game.drainEvents()) {
    if (event.type === 'eat') onEat(event);
    else if (event.type === 'die') onDied(event.reason);
    else if (event.type === 'win') onWon();
    else if (event.type === 'start') sound.start();
  }
}

function settleRun(reason) {
  if (settled) return;
  settled = true;

  const score = game.score;
  const runDate = game.runDate ?? today();
  const runDateObj = new Date(`${runDate}T12:00:00`);

  if (mode === 'daily') {
    const next = finishRun(loadDay(storage, runDateObj), score);
    if (!saveDay(storage, runDateObj, next)) warnStorageOnce();
    dayState = runDate === today() ? next : loadDay(storage);
  }

  if (score > allTimeBest) {
    allTimeBest = score;
    writeNumber(BEST_KEY, allTimeBest);
  }

  const updated = updateStreak(loadStreak(storage), score, runDate);
  if (updated.count !== streak.count || updated.lastDate !== streak.lastDate) {
    saveStreak(storage, updated);
    streak = updated;
  }

  if (mode === 'daily') {
    const left = dayState.attemptsLeft;
    if (left > 0) announce(`游戏结束，本局 ${score} 分，${reason === 'wall' ? '撞到墙了' : reason === 'self' ? '咬到自己了' : '你结束了本局'}。今日剩余 ${left} 次`);
    else announce('今日挑战已完成，明天零点刷新');
  }
}

function onDied(reason) {
  sound.die();
  renderer.triggerShake();
  settleRun(reason);
  lastDeathReason = reason;
  renderOverlay(true);
}

let lastDeathReason = 'wall';

function onWon() {
  sound.start();
  settleRun('win');
  renderOverlay(true);
}

/* ---------------------------------------------------------------- overlay */

function showCountdown() {
  ui.countdown.hidden = false;
  ui.countdownValue.textContent = String(CONFIG.countdown.seconds);
  lastCountdownShown = CONFIG.countdown.seconds;
}

function hideCountdown() {
  ui.countdown.hidden = true;
  lastCountdownShown = 0;
}

function setButton(button, label, visible = true) {
  button.textContent = label ?? '';
  button.hidden = !visible || !label;
}

function renderOverlay(force = false) {
  if (!force && game.status === lastStatus && game.status === 'running') return;
  lastStatus = game.status;

  const overlayVisible = game.status !== 'running';
  ui.overlay.classList.toggle('is-hidden', !overlayVisible);
  ui.overlay.dataset.state = game.status;

  if (!overlayVisible) {
    showCountdownIfNeeded();
    return;
  }

  const touch = touchLike();
  const daily = mode === 'daily';
  const attempts = dayState.attemptsLeft;
  const streakDays = displayStreak(streak, today());
  let title = '贪吃蛇';
  let sub = '';
  let action = '开始游戏';
  let secondary = null;
  let extra = null;
  let hint = '';

  switch (game.status) {
    case 'ready':
      if (daily && attempts > 0) {
        title = '每日挑战';
        sub = dailyReadyLine({ date: today(), attemptsLeft: attempts });
        action = '开始今日挑战';
        secondary = '练习模式';
        hint = [streakDays > 0 ? `连续 ${streakDays} 天` : '', dayState.best > 0 ? `今日最佳 ${dayState.best}` : '']
          .filter(Boolean).join(' · ') || (firstVisit() ? (touch ? '滑动或点按开始' : '方向键 / WASD 开始') : '');
      } else if (daily) {
        title = '今日完成';
        sub = dailyDoneLine({ best: dayState.best, streak: streakDays });
        action = dayState.best > 0 ? '分享战绩' : '练习模式';
        secondary = '练习模式';
        hint = refreshLine(new Date());
      } else {
        title = '贪吃蛇';
        sub = firstVisit()
          ? (touch ? '滑动或点按开始' : '方向键 / WASD 开始')
          : (touch ? '滑动或点按开始' : '方向键 / WASD 控制，空格开始');
        action = '开始游戏';
        secondary = '每日挑战';
        hint = touch ? '移动端可滑动屏幕操作' : '空格 开始 · 方向键 / WASD 转向';
      }
      break;

    case 'paused':
      title = '已暂停';
      sub = '深呼吸，然后继续';
      action = '继续游戏';
      secondary = daily ? null : '重新开始';
      extra = daily ? '结束本局' : null;
      hint = daily ? '空格 继续 · R 无效' : '空格 继续 · R 重开';
      break;

    case 'over':
      if (daily && attempts === 0) {
        title = '今日完成';
        sub = dailyDoneLine({ best: dayState.best, streak: streakDays });
        action = '分享战绩';
        secondary = '练习模式';
        hint = refreshLine(new Date());
      } else {
        title = '游戏结束';
        sub = daily
          ? `${overSubtitle({ score: game.score, reason: lastDeathReason })} · ${dailyOverLine({ best: dayState.best, attemptsLeft: attempts })}`
          : overSubtitle({ score: game.score, reason: lastDeathReason });
        action = daily ? `再来一局（剩 ${attempts} 次）` : '再来一局';
        secondary = daily ? '分享战绩' : '每日挑战';
        hint = daily ? '每天 3 次机会' : '按 R 快速重开';
      }
      break;

    case 'won':
      title = '完美通关';
      sub = `${CONFIG.cols * CONFIG.rows} 格 · ${game.score} 分`;
      action = '再来一局';
      secondary = daily ? '分享战绩' : '每日挑战';
      hint = '';
      break;

    case 'countdown':
      // Only the 3-2-1 is on screen; the copy stays out of the way.
      title = '';
      sub = '';
      action = null;
      secondary = null;
      extra = null;
      hint = '';
      break;

    default:
      break;
  }

  ui.title.textContent = title;
  ui.sub.textContent = sub;
  setButton(ui.action, action);
  setButton(ui.secondary, secondary);
  setButton(ui.quit, extra);
  ui.hint.textContent = hint;
  ui.foot.textContent = daily
    ? dailyFooter({ attemptsLeft: attempts, streak: streakDays })
    : '空格 暂停 · R 重开';

  if (game.status !== 'countdown') hideCountdown();
  focusPrimary();
  showCountdownIfNeeded();
}

function showCountdownIfNeeded() {
  if (game.status === 'countdown') showCountdown();
}

let focusTimer = null;

function focusPrimary() {
  if (game.status === 'running') return;
  clearTimeout(focusTimer);
  // Wait for the overlay transition so focus lands on something visible.
  focusTimer = setTimeout(() => {
    if (game.status !== 'running' && !ui.action.hidden) ui.action.focus({ preventScroll: true });
  }, 60);
}

/* ---------------------------------------------------------------- actions */

function startRun(which = mode) {
  if (which !== mode) newGame(which);
  if (mode === 'daily') {
    dayState = loadDay(storage, new Date());
    if (dayState.attemptsLeft <= 0) {
      renderOverlay(true);
      return;
    }
    game = new SnakeGame(CONFIG, rngForDate(today()));
    game.startDaily(today());
    settled = false;
    accumulator = 0;
    alpha = 0;
    game.start();
    announce(`每日挑战开始，今天剩余 ${dayState.attemptsLeft} 次机会`);
  } else {
    game.start();
  }
  markSeen();
  consumeEvents();
  renderOverlay(true);
}

function primaryAction() {
  switch (game.status) {
    case 'ready':
      startRun();
      break;
    case 'running':
      game.pause();
      autoPaused = false;
      break;
    case 'paused':
      resumeRun();
      break;
    case 'over':
    case 'won':
      if (mode === 'daily' && dayState.attemptsLeft <= 0) {
        shareResultCard();
      } else {
        startRun();
      }
      break;
    default:
      break;
  }
  consumeEvents();
  renderOverlay(true);
}

function resumeRun() {
  if (autoPaused) {
    autoPaused = false;
    countdown.startedAt = performance.now();
    countdown.leaves = 0;
    game.beginCountdown();
    showCountdown();
  } else {
    game.resume();
    accumulator = 0;
    alpha = 0;
  }
}

function handleDirection(direction) {
  if (game.status === 'ready') {
    startRun();
  }
  if (game.status === 'running') game.queueDirection(direction);
  consumeEvents();
  renderOverlay();
}

async function shareResultCard() {
  const runDate = game.runDate ?? today();
  const best = mode === 'daily' ? Math.max(dayState.best, game.score) : Math.max(allTimeBest, game.score);
  if (best <= 0) {
    toast('本局还没有分数');
    return;
  }

  const streakDays = displayStreak(streak, today());
  const attempt = mode === 'daily' ? Math.max(1, dayState.runs) : 1;
  const url = new URL(window.location.href);
  url.search = '?from=share';

  try {
    const { shareCopy, cardFileName, shareResult, drawCard } = await import('./share.js');
    const copy = shareCopy({ date: runDate, best, streak: streakDays, attempt, url: url.toString() });
    const fileName = cardFileName({ date: runDate, best });

    let blob = null;
    try {
      const card = document.createElement('canvas');
      card.width = CONFIG.share.width;
      card.height = CONFIG.share.height;
      drawCard(card.getContext('2d'), {
        width: CONFIG.share.width,
        height: CONFIG.share.height,
        date: runDate,
        best,
        streak: streakDays,
        attempt,
        url: url.toString(),
        palette: { ...CONFIG.palette, accent: '#7cffb2' },
      });
      blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'));
    } catch {
      blob = null;
    }

    const outcome = await shareResult({ copy, fileName, blob });
    if (outcome === 'shared') announce('战绩卡已生成');
    else if (outcome === 'downloaded') toast('已下载战绩卡');
    else if (outcome === 'copied') toast('战绩卡生成失败，已复制文案');
    else if (outcome === 'failed') toast('分享失败，请稍后再试');
  } catch {
    toast('分享卡生成失败，已复制文案');
  }
}

function toggleMute() {
  const enabled = sound.toggle();
  ui.mute.textContent = enabled ? '🔊' : '🔇';
  ui.mute.setAttribute('aria-pressed', String(!enabled));
  try {
    storage?.setItem(MUTED_KEY, enabled ? '0' : '1');
  } catch {
    // Ignore: the setting simply will not persist.
  }
}

function endRun() {
  if (game.status === 'paused' || game.status === 'countdown') {
    game.quit('quit');
    consumeEvents();
    renderOverlay(true);
  }
}

/* ------------------------------------------------------------------ clock */

const countdownFrame = () => {
  const elapsed = performance.now() - countdown.startedAt;
  const value = countdownValue(elapsed);

  if (value !== lastCountdownShown) {
    lastCountdownShown = value;
    ui.countdownValue.textContent = String(Math.max(1, value));
  }

  if (value === 0) {
    game.endCountdown();
    hideCountdown();
    accumulator = 0;
    alpha = 0;
  }
};

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (game.status === 'countdown') countdownFrame();

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
  renderOverlay();

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ pause */

let blurTimer = null;
let blurredAt = 0;

function pauseForHidden() {
  if (game.status === 'countdown') {
    countdown.leaves += 1;
    if (countdownLeavesExceeded(countdown.leaves)) {
      game.quit('leave');
      settleRun('leave');
      consumeEvents();
      renderOverlay(true);
      return;
    }
    countdown.startedAt = performance.now();
    lastCountdownShown = 0;
    return;
  }

  if (game.status === 'running') {
    game.pause();
    autoPaused = true;
    renderOverlay(true);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForHidden();
});

window.addEventListener('blur', () => {
  blurredAt = performance.now();
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    if (shouldPauseOnBlur(blurredAt, performance.now())) pauseForHidden();
  }, CONFIG.blurDebounceMs);
});

window.addEventListener('focus', () => clearTimeout(blurTimer));

/* ------------------------------------------------------------------- wire */

renderer = new Renderer(canvas, CONFIG);
sound = new Sound();
newGame('daily');

ui.action.addEventListener('click', primaryAction);

ui.secondary.addEventListener('click', () => {
  const label = ui.secondary.textContent;
  if (label === '练习模式') startRun('practice');
  else if (label === '每日挑战') startRun('daily');
  else if (label === '分享战绩') shareResultCard();
  else if (label === '重新开始') {
    game.restart();
    accumulator = 0;
    alpha = 0;
    consumeEvents();
    renderOverlay(true);
  }
});

ui.quit.addEventListener('click', endRun);
ui.mute.addEventListener('click', toggleMute);

// R5.4: tapping the stage starts the run, not just the button.
stage.addEventListener('click', (event) => {
  if (event.target.closest('button')) return;
  if (game.status === 'ready') primaryAction();
});

bindInput({
  canvas: stage,
  onDirection: handleDirection,
  onPrimary: primaryAction,
  onRestart: () => {
    const outcome = game.pressRestart(performance.now(), mode === 'daily');
    if (outcome === 'restarted') {
      accumulator = 0;
      alpha = 0;
    } else if (outcome === 'paused' && mode !== 'daily') {
      toast('再按 R 重开');
    }
    consumeEvents();
    renderOverlay(true);
  },
  onMute: toggleMute,
});

ui.mute.textContent = sound.enabled ? '🔊' : '🔇';
try {
  if (storage?.getItem(MUTED_KEY) === '1' && sound.enabled) toggleMute();
} catch {
  // Ignore.
}

if (firstVisit()) markSeen();
pruneDaily(storage, new Date());

registerServiceWorker({
  onUpdate: () => toast('新版本已就绪，刷新后生效'),
});

renderOverlay(true);
requestAnimationFrame(frame);

export { shareResultCard, startRun, endRun };
