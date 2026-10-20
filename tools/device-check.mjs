// Device-matrix checks over the DevTools Protocol.
//
// This is emulation, not a real handset: it settles layout, touch targeting
// and the iOS hint logic, but it cannot prove Safari's share sheet or
// WeChat's WebView behave. Use docs/device-checklist.md for the physical pass.
//
//   chrome --headless=new --remote-debugging-port=9333 http://127.0.0.1:8123/
//   node tools/device-check.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = process.env.CDP || 'http://127.0.0.1:9333';
const OUT = process.argv[2] || '.';
const DAY = 24 * 60 * 60 * 1000;

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

const targets = await (await fetch(`${ENDPOINT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('8123'))
  ?? targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};

await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const evaluate = async (expression, awaitPromise = false) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.text ?? 'eval failed');
  return result.result?.result?.value;
};

const results = [];
function check(name, actual, predicate, expected) {
  const ok = predicate(actual);
  results.push({ name, ok, actual });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${JSON.stringify(actual)})`);
  if (!ok) console.log(`       expected ${JSON.stringify(expected)}`);
}

async function useDevice({ width, height, dpr, mobile, userAgent, platform }) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent, platform });
}

async function reload() {
  await send('Page.reload');
  await sleep(1300);
}

async function layoutProbe(label) {
  const overflow = await evaluate('document.documentElement.scrollWidth - window.innerWidth');
  check(`${label}: no horizontal overflow`, overflow, (v) => v <= 1, '<= 1px');

  const small = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('button')]
    .filter((b) => !b.hidden)
    .map((b) => ({ id: b.id, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }))
    .filter((b) => b.w < 44 || b.h < 44))`));
  check(`${label}: buttons >= 44x44`, small, (v) => v.length === 0, []);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `device-${label}.png`);
  fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
}

await send('Page.enable');
await send('Runtime.enable');

// A previously registered service worker would serve the old shell and make
// every check below meaningless. Drop it, and the caches, before measuring.
await evaluate(`(async () => {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {}
})()`, true);
await reload();
await reload();

// --- iPhone 15, eight days after the first visit -------------------------
await useDevice({ width: 390, height: 844, dpr: 3, mobile: true, userAgent: IPHONE, platform: 'iPhone' });
await evaluate(`localStorage.clear();
  localStorage.setItem('snake:firstSeen:v1', String(Date.now() - 8 * ${DAY}));
  localStorage.setItem('snake:seen:v1', '1')`);
await reload();

const iphoneUa = await evaluate('navigator.userAgent');
check('iPhone: UA emulation applied', iphoneUa, (v) => /iPhone/.test(v), 'iPhone UA');

check('iPhone: install hint appears after seven days',
  await evaluate('document.getElementById("ios-tip").hidden ? "" : document.getElementById("ios-tip").textContent'),
  (v) => v === '分享 → 添加到主屏幕，离线可玩', '分享 → 添加到主屏幕，离线可玩');
await layoutProbe('iphone15');

await reload();
check('iPhone: the hint does not repeat',
  await evaluate('document.getElementById("ios-tip").hidden'),
  (v) => v === true, true);

// --- iPhone, six days after the first visit ------------------------------
await evaluate(`localStorage.setItem('snake:firstSeen:v1', String(Date.now() - 6 * ${DAY}));
  localStorage.removeItem('snake:iosTipSeen:v1')`);
await reload();
check('iPhone day six: no hint yet',
  await evaluate('document.getElementById("ios-tip").hidden'),
  (v) => v === true, true);

// --- Android -------------------------------------------------------------
await useDevice({ width: 412, height: 915, dpr: 2.6, mobile: true, userAgent: ANDROID, platform: 'Linux armv8l' });
await evaluate(`localStorage.setItem('snake:firstSeen:v1', String(Date.now() - 30 * ${DAY}));
  localStorage.removeItem('snake:iosTipSeen:v1')`);
await reload();
check('Android: never shows the iOS hint',
  await evaluate('document.getElementById("ios-tip").hidden'),
  (v) => v === true, true);
await layoutProbe('android');

// --- 320px floor (PRD 8.5) ----------------------------------------------
await useDevice({ width: 320, height: 568, dpr: 2, mobile: true, userAgent: IPHONE, platform: 'iPhone' });
await reload();
await layoutProbe('iphone-se-320');

const titleSize = await evaluate('getComputedStyle(document.getElementById("ov-title")).fontSize');
check('320px: overlay title steps down to 28px', titleSize, (v) => v === '28px', '28px');

// --- iPhone in landscape (PRD 8.5: shrink, never force portrait) ----------
await useDevice({ width: 844, height: 390, dpr: 3, mobile: true, userAgent: IPHONE, platform: 'iPhone' });
await reload();

const fits = await evaluate('document.querySelector(".app").getBoundingClientRect().bottom <= window.innerHeight + 1');
check('landscape: the whole app fits the viewport height', fits, (v) => v === true, true);

const stageRatio = await evaluate(`(() => {
  const r = document.getElementById("stage").getBoundingClientRect();
  return Math.round((r.width / r.height) * 100) / 100;
})()`);
check('landscape: the stage stays square', stageRatio, (v) => Math.abs(v - 1) < 0.02, '1.00');
await layoutProbe('iphone15-landscape');

socket.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
