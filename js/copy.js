/**
 * UI copy, verbatim from PRD §8.2. Pure string builders so the wording can be
 * tested without a DOM — and so nobody "improves" the tone by accident.
 */

const DEATH_LABELS = {
  wall: '撞到墙了',
  self: '咬到自己了',
  quit: '你结束了本局',
  leave: '你离开了',
};

/** @param {'wall'|'self'|'quit'|'leave'} reason */
export function deathLabel(reason) {
  return DEATH_LABELS[reason] ?? DEATH_LABELS.wall;
}

/** `本局 80 分 · 撞到墙了` */
export function overSubtitle({ score, reason }) {
  return `本局 ${score} 分 · ${deathLabel(reason)}`;
}

/** `10月20日` */
export function monthDay(date) {
  const value = date instanceof Date ? date : new Date(`${date}T12:00:00`);
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  return `${safe.getMonth() + 1}月${safe.getDate()}日`;
}

/** `10月20日 · 同一开局 · 今日剩 3 次` */
export function dailyReadyLine({ date, attemptsLeft }) {
  return `${monthDay(date)} · 同一开局 · 今日剩 ${attemptsLeft} 次`;
}

/** `剩 2 次 · 连续 4 天`; the streak half disappears when there is none. */
export function dailyFooter({ attemptsLeft, streak }) {
  return streak > 0 ? `剩 ${attemptsLeft} 次 · 连续 ${streak} 天` : `剩 ${attemptsLeft} 次`;
}

/** `今日最佳 240 · 剩 2 次` */
export function dailyOverLine({ best, attemptsLeft }) {
  return `今日最佳 ${best} · 剩 ${attemptsLeft} 次`;
}

/** `最佳 240 分 · 连续 4 天` */
export function dailyDoneLine({ best, streak }) {
  return `最佳 ${best} 分 · 连续 ${streak} 天`;
}

/** `还有 7 小时 12 分`, or `还有 43 分` inside the last hour. */
export function timeUntilMidnight(now = new Date()) {
  const end = new Date(now.getTime());
  end.setHours(24, 0, 0, 0);

  const minutesTotal = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;

  return hours > 0 ? `还有 ${hours} 小时 ${minutes} 分` : `还有 ${minutes} 分`;
}

/** `明天 00:00 刷新 · 还有 7 小时 12 分` */
export function refreshLine(now = new Date()) {
  return `明天 00:00 刷新 · ${timeUntilMidnight(now)}`;
}
