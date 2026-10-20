import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deathLabel,
  overSubtitle,
  monthDay,
  dailyReadyLine,
  dailyFooter,
  dailyOverLine,
  dailyDoneLine,
  timeUntilMidnight,
  refreshLine,
} from '../js/copy.js';

test('death labels state the fact without judging', () => {
  assert.equal(deathLabel('wall'), '撞到墙了');
  assert.equal(deathLabel('self'), '咬到自己了');
  assert.equal(deathLabel('quit'), '你结束了本局');
  assert.equal(deathLabel('leave'), '你离开了');
});

test('the over subtitle reads 本局 N 分 · reason', () => {
  assert.equal(overSubtitle({ score: 80, reason: 'wall' }), '本局 80 分 · 撞到墙了');
});

test('monthDay drops the leading zero', () => {
  assert.equal(monthDay('2026-10-20'), '10月20日');
  assert.equal(monthDay('2026-01-05'), '1月5日');
});

test('daily ready line matches the copy table', () => {
  assert.equal(
    dailyReadyLine({ date: '2026-10-20', attemptsLeft: 3 }),
    '10月20日 · 同一开局 · 今日剩 3 次',
  );
});

test('footer and over lines carry attempts and streak', () => {
  assert.equal(dailyFooter({ attemptsLeft: 2, streak: 4 }), '剩 2 次 · 连续 4 天');
  assert.equal(dailyFooter({ attemptsLeft: 3, streak: 0 }), '剩 3 次', 'no streak, no streak text');
  assert.equal(dailyOverLine({ best: 240, attemptsLeft: 2 }), '今日最佳 240 · 剩 2 次');
  assert.equal(dailyDoneLine({ best: 240, streak: 4 }), '最佳 240 分 · 连续 4 天');
});

test('time until midnight switches between hours and minutes', () => {
  assert.equal(timeUntilMidnight(new Date('2026-10-20T16:48:00')), '还有 7 小时 12 分');
  assert.equal(timeUntilMidnight(new Date('2026-10-20T23:17:00')), '还有 43 分');
  assert.equal(refreshLine(new Date('2026-10-20T16:48:00')), '明天 00:00 刷新 · 还有 7 小时 12 分');
});
