import { CONFIG } from './config.js';
export function isIos({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}
export function shouldShowIosTip({
  userAgent = '',
  maxTouchPoints = 0,
  standalone = false,
  firstSeenAt = null,
  now = Date.now(),
  seen = false,
  days = CONFIG.iosTip.days,
} = {}) {
  if (seen || standalone) return false;
  if (!isIos({ userAgent, maxTouchPoints })) return false;
  if (!Number.isFinite(firstSeenAt)) return false;
  if (firstSeenAt > now) return false;
  return now - firstSeenAt >= days * 24 * 60 * 60 * 1000;
}
export const IOS_TIP_TEXT = '分享 → 添加到主屏幕，离线可玩';
