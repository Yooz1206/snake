// v1.1 acceptance smoke test over the DevTools Protocol.
//
// Checks the things unit tests cannot: the daily overlay, the auto-pause
// countdown, and that a real browser can draw the 1080×1350 share card.
//
//   chrome --headless=new --remote-debugging-port=9333 http://127.0.0.1:8123/
//   node tools/v11-check.mjs [out.png]
import fs from 'node:fs';

const ENDPOINT = process.env.CDP || 'http://127.0.0.1:9333';
const SHOT = process.argv[2] || 'v11-card.png';

const targets = await (await fetch(`${ENDPOINT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('8123'))
  ?? targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;
const problems = [];

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    problems.push(message.params.exceptionDetails?.exception?.description ?? 'exception');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    problems.push(message.params.args.map((a) => a.value ?? a.description).join(' '));
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
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (result.result?.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.text ?? 'evaluation failed');
  }
  return result.result?.result?.value;
};

async function key(keyName, code, keyCode) {
  await send('Input.dispatchKeyEvent', {
    type: keyName === ' ' ? 'keyDown' : 'rawKeyDown',
    key: keyName,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyName,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

const checks = [];
function check(name, actual, predicate, expected) {
  const ok = predicate(actual);
  checks.push({ name, ok, actual, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${JSON.stringify(actual)})`);
}

await send('Page.enable');
await send('Runtime.enable');

// Drop any previously registered service worker: a stale shell would serve
// the old modules and quietly invalidate every check below.
await evaluate(`(async () => {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {}
})()`, true);

// Fresh state: no daily record, no seen flag.
await evaluate('localStorage.clear()');
await send('Page.reload');
await sleep(1200);

check('ready overlay is the daily challenge', await evaluate('document.getElementById("ov-title").textContent'), (v) => v === '每日挑战', '每日挑战');
check('ready line shows three attempts', await evaluate('document.getElementById("ov-sub").textContent'), (v) => /今日剩 3 次/.test(v), '今日剩 3 次');
check('brand reads DAILY', await evaluate('document.getElementById("brand").textContent'), (v) => v === 'DAILY', 'DAILY');

const guide = await evaluate(`(() => {
  const el = document.getElementById('guide');
  return { hidden: el.hidden, html: el.innerHTML.slice(0, 40) };
})()`);
check('first visit shows the control guide', guide, (v) => v.hidden === false && v.html.includes('keycaps'), 'keycaps visible');

await key(' ', 'Space', 32);
await sleep(400);
check('space starts the run', await evaluate('document.getElementById("overlay").classList.contains("is-hidden")'), (v) => v === true, true);
check('the guide disappears once the run starts', await evaluate('document.getElementById("guide").hidden'), (v) => v === true, true);

// Auto-pause → countdown → running (R4.4/R4.6).
await evaluate('window.dispatchEvent(new Event("blur"))');
await sleep(200);
check('blur pauses', await evaluate('document.getElementById("overlay").dataset.state'), (v) => v === 'paused', 'paused');

await key(' ', 'Space', 32);
await sleep(150);
check('resume starts a countdown', await evaluate('document.getElementById("overlay").dataset.state'), (v) => v === 'countdown', 'countdown');
check('countdown is visible', await evaluate('document.getElementById("countdown").hidden'), (v) => v === false, false);

await sleep(1300);
check('countdown ends into running', await evaluate('document.getElementById("overlay").dataset.state'), (v) => v === 'running', 'running');

// The share card must render in a real browser, not just in theory.
const card = await evaluate(`(async () => {
  const { drawCard } = await import('./js/share.js');
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  drawCard(canvas.getContext('2d'), {
    width: 1080, height: 1350, date: '2026-10-20', best: 240,
    streak: 3, attempt: 2, url: 'https://yooz1206.github.io/snake/?from=share',
  });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { size: blob ? blob.size : -1, data: canvas.toDataURL('image/png') };
})()`, true);

check('share card renders as a PNG', card.size, (v) => v > 10000, '> 10KB');
fs.writeFileSync(SHOT, Buffer.from(card.data.split(',')[1], 'base64'));
console.log('card image  :', SHOT);

// R3.1: after one online visit, an offline reload must still boot.
await send('Network.enable');
await send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});
await send('Page.reload');
await sleep(1600);
check('offline reload still boots', await evaluate('document.getElementById("ov-title").textContent'), (v) => v === '每日挑战', '每日挑战');
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});

// A death must settle the daily record even though the daily module loads
// after the first paint. Steering straight into a wall takes ~2s.
await evaluate('localStorage.clear()');
await send('Page.reload');
await sleep(1200);
await key(' ', 'Space', 32);
await sleep(300);
await key('ArrowUp', 'ArrowUp', 38);
await sleep(3200);

const settled = await evaluate(`(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('snake:daily:v1:'));
  return key ? localStorage.getItem(key) : null;
})()`);
check('a death decrements the daily attempts', settled, (v) => {
  try {
    return v !== null && JSON.parse(v).attemptsLeft === 2 && JSON.parse(v).runs === 1;
  } catch {
    return false;
  }
}, 'attemptsLeft 2, runs 1');

// R6.2: every clickable target must be at least 44x44 CSS px.
const targetsRect = await evaluate(`JSON.stringify([...document.querySelectorAll('button')]
  .filter((b) => !b.hidden)
  .map((b) => ({ id: b.id, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })))`);
const tooSmall = JSON.parse(targetsRect).filter((t) => t.w < 44 || t.h < 44);
check('all visible buttons are >= 44x44', tooSmall, (v) => v.length === 0, '[]');

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(SHOT.replace(/\.png$/, '-page.png'), Buffer.from(shot.result.data, 'base64'));

check('no console errors or exceptions', problems.length, (v) => v === 0, 0);
if (problems.length) console.log(problems.slice(0, 5));

socket.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
