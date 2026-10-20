const DEATH_LABELS = {
  wall: '撞到墙了',
  self: '咬到自己了',
  quit: '你结束了本局',
  leave: '你离开了',
};
export function deathLabel(reason) {
  return DEATH_LABELS[reason] ?? DEATH_LABELS.wall;
}
export function overSubtitle({ score, reason }) {
  return `本局 ${score} 分 · ${deathLabel(reason)}`;
}
export function monthDay(date) {
  const value = date instanceof Date ? date : new Date(`${date}T12:00:00`);
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  return `${safe.getMonth() + 1}月${safe.getDate()}日`;
}
export function dailyReadyLine({ date, attemptsLeft }) {
  return `${monthDay(date)} · 同一开局 · 今日剩 ${attemptsLeft} 次`;
}
export function dailyFooter({ attemptsLeft, streak }) {
  return streak > 0 ? `剩 ${attemptsLeft} 次 · 连续 ${streak} 天` : `剩 ${attemptsLeft} 次`;
}
export function dailyOverLine({ best, attemptsLeft }) {
  return `今日最佳 ${best} · 剩 ${attemptsLeft} 次`;
}
export function dailyDoneLine({ best, streak }) {
  return `最佳 ${best} 分 · 连续 ${streak} 天`;
}
export function timeUntilMidnight(now = new Date()) {
  const end = new Date(now.getTime());
  end.setHours(24, 0, 0, 0);
  const minutesTotal = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return hours > 0 ? `还有 ${hours} 小时 ${minutes} 分` : `还有 ${minutes} 分`;
}
export function refreshLine(now = new Date()) {
  return `明天 00:00 刷新 · ${timeUntilMidnight(now)}`;
}
