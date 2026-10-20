import { monthDay } from './copy.js';
export function shareCopy({ date, best, streak, attempt, url }) {
  const attemptPart = attempt ? `（第 ${attempt} 次）` : '';
  return `Snake 每日挑战 ${monthDay(date)}：${best} 分${attemptPart}，连续 ${streak} 天。来玩今天的 → ${url}`;
}
export function cardFileName({ date, best }) {
  return `snake-${date}-${best}.png`;
}
function resolveDeps(deps) {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: deps.share ?? (typeof nav?.share === 'function' ? nav.share.bind(nav) : null),
    canShare: deps.canShare ?? (typeof nav?.canShare === 'function' ? nav.canShare.bind(nav) : null),
    copyText: deps.copyText
      ?? (typeof nav?.clipboard?.writeText === 'function'
        ? (text) => nav.clipboard.writeText(text)
        : null),
    download: deps.download ?? defaultDownload,
  };
}
function defaultDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function shareResult({ copy, fileName, blob = null, file = null }, deps = {}) {
  const io = resolveDeps(deps);
  const payload = file
    ?? (blob && typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null);
  if (payload && io.share && io.canShare?.({ files: [payload] })) {
    try {
      await io.share({ files: [payload], text: copy, title: 'Snake 每日挑战' });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
    }
  }
  if (blob) {
    try {
      await io.download(blob, fileName);
      return 'downloaded';
    } catch {
    }
  }
  if (io.copyText) {
    try {
      await io.copyText(copy);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
export function drawCard(ctx, { width, height, date, best, streak, attempt, url, palette }) {
  const bg = palette?.background ?? '#0a0d12';
  const accent = palette?.accent ?? '#7cffb2';
  const text = '#e8edf2';
  const muted = '#7a8796';
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width / 2, height * 0.28, 0, width / 2, height * 0.28, height * 0.6);
  glow.addColorStop(0, 'rgba(124,255,178,0.16)');
  glow.addColorStop(1, 'rgba(124,255,178,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(width * 0.28, height * 0.22);
  ctx.lineTo(width * 0.55, height * 0.22);
  ctx.quadraticCurveTo(width * 0.72, height * 0.22, width * 0.72, height * 0.30);
  ctx.quadraticCurveTo(width * 0.72, height * 0.38, width * 0.55, height * 0.38);
  ctx.lineTo(width * 0.40, height * 0.38);
  ctx.stroke();
  ctx.fillStyle = palette?.food ?? '#ff8a5b';
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.30, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = text;
  ctx.font = '600 64px ui-sans-serif, system-ui, "Noto Sans SC", sans-serif';
  ctx.fillText('每日挑战', width / 2, height * 0.46);
  ctx.font = '700 220px ui-sans-serif, system-ui, "Noto Sans SC", sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(String(best), width / 2, height * 0.60);
  ctx.font = '500 52px ui-sans-serif, system-ui, "Noto Sans SC", sans-serif';
  ctx.fillStyle = text;
  ctx.fillText(`${monthDay(date)} · 今日最佳`, width / 2, height * 0.67);
  const meta = attempt ? `连续 ${streak} 天 · 第 ${attempt} 次` : `连续 ${streak} 天`;
  ctx.font = '400 44px ui-sans-serif, system-ui, "Noto Sans SC", sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText(meta, width / 2, height * 0.72);
  ctx.font = '400 38px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(url, width / 2, height * 0.90);
  ctx.restore();
}
