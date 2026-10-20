/**
 * iOS install hint (PRD R3.10).
 *
 * iOS Safari has no `beforeinstallprompt`, so "no custom install prompt" would
 * leave iPhone players with no idea the game can be installed. The spec asks
 * for one quiet line in the ready-state footer, seven days after the first
 * visit, shown once and never again.
 *
 * Pure so it can be tested without a browser.
 */
import { CONFIG } from './config.js';

/**
 * iPhone/iPad/iPod, plus iPadOS in desktop mode, which reports a Macintosh
 * user agent and reports multiple touch points.
 */
export function isIos({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * @param {{
 *   userAgent?: string,
 *   maxTouchPoints?: number,
 *   standalone?: boolean,
 *   firstSeenAt?: number|null,
 *   now?: number,
 *   seen?: boolean,
 *   days?: number,
 * }} input
 * @returns {boolean}
 */
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

  // A clock that moved backwards is not a reason to nag early.
  if (firstSeenAt > now) return false;

  return now - firstSeenAt >= days * 24 * 60 * 60 * 1000;
}

/** The one line shown in the footer. */
export const IOS_TIP_TEXT = '分享 → 添加到主屏幕，离线可玩';
