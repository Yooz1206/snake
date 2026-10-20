import test from 'node:test';
import assert from 'node:assert/strict';

import { isIos, shouldShowIosTip, IOS_TIP_TEXT } from '../js/ios.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

test('iOS detection covers iPhone, iPad and iPadOS desktop mode', () => {
  assert.equal(isIos({ userAgent: IPHONE }), true);
  assert.equal(isIos({ userAgent: IPAD_DESKTOP, maxTouchPoints: 5 }), true);
  assert.equal(isIos({ userAgent: IPAD_DESKTOP, maxTouchPoints: 0 }), false, 'a real Mac is not iOS');
  assert.equal(isIos({ userAgent: ANDROID }), false);
});

test('the tip waits seven days after the first visit', () => {
  assert.equal(shouldShowIosTip({ userAgent: IPHONE, firstSeenAt: NOW - 6 * DAY, now: NOW }), false);
  assert.equal(shouldShowIosTip({ userAgent: IPHONE, firstSeenAt: NOW - 7 * DAY, now: NOW }), true);
  assert.equal(shouldShowIosTip({ userAgent: IPHONE, firstSeenAt: NOW - 30 * DAY, now: NOW }), true);
});

test('the tip never shows twice, in standalone, or off iOS', () => {
  const base = { userAgent: IPHONE, firstSeenAt: NOW - 30 * DAY, now: NOW };
  assert.equal(shouldShowIosTip({ ...base, seen: true }), false);
  assert.equal(shouldShowIosTip({ ...base, standalone: true }), false);
  assert.equal(shouldShowIosTip({ ...base, userAgent: ANDROID }), false);
});

test('an unknown first visit or a rolled-back clock shows nothing', () => {
  assert.equal(shouldShowIosTip({ userAgent: IPHONE, firstSeenAt: null, now: NOW }), false);
  assert.equal(shouldShowIosTip({ userAgent: IPHONE, firstSeenAt: NOW + DAY, now: NOW }), false);
});

test('the line is the one the spec wrote', () => {
  assert.equal(IOS_TIP_TEXT, '分享 → 添加到主屏幕，离线可玩');
});
