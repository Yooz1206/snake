// Lighthouse substitute: LCP / CLS / long tasks under Lighthouse-mobile
// conditions (4x CPU slowdown, 1.6 Mbps down, 150 ms RTT), via DevTools
// Protocol only — no npm, no Lighthouse package.
//
//   python -m http.server 8123
//   chrome --headless=new --remote-debugging-port=9333 http://127.0.0.1:8123/
//   node tools/perf-check.mjs
const ENDPOINT = process.env.CDP || 'http://127.0.0.1:9333';

const targets = await (await fetch(`${ENDPOINT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('8123'));
if (!page) throw new Error('no page on :8123');

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

const send = (method, params = {}) => new Promise((resolve) => {
  const next = ++id;
  pending.set(next, resolve);
  ws.send(JSON.stringify({ id: next, method, params }));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.result?.value;
};

const probe = `(() => {
  window.__perf = { lcp: 0, cls: 0, tbt: 0, longTasks: 0, dcl: 0, load: 0, tasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__perf.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__perf.longTasks += 1;
        window.__perf.tbt += Math.max(0, entry.duration - 50);
        window.__perf.tasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'domContentLoaded') window.__perf.dcl = entry.startTime;
        if (entry.name === 'loadEventEnd') window.__perf.load = entry.startTime;
      }
    }).observe({ type: 'navigation', buffered: true });
  } catch {}
})();`;

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 412, height: 915, deviceScaleFactor: 2.6, mobile: true,
});
await send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Page.addScriptToEvaluateOnNewDocument', { source: probe });

// Warm the service worker, then measure a cold cache miss with the throttle on.
await send('Page.navigate', { url: 'http://127.0.0.1:8123/?v=perf' });
await sleep(4000);
await send('Page.navigate', { url: 'http://127.0.0.1:8123/?v=perf2' });
await sleep(6000);

const perf = JSON.parse(await evaluate('JSON.stringify(window.__perf)'));
console.log('long tasks (start ms, duration ms):', JSON.stringify(perf.tasks));
const budget = { lcp: 1000, cls: 0.02, tbt: 0, longTasks: 0 };

const rows = [
  ['LCP', `${Math.round(perf.lcp)} ms`, `<= ${budget.lcp} ms`, perf.lcp <= budget.lcp && perf.lcp > 0],
  ['CLS', perf.cls.toFixed(4), `<= ${budget.cls}`, perf.cls <= budget.cls],
  ['TBT', `${Math.round(perf.tbt)} ms`, '<= 0 ms', perf.tbt === 0],
  ['long tasks (>50ms)', perf.longTasks, '0', perf.longTasks === budget.longTasks],
  ['DOMContentLoaded', `${Math.round(perf.dcl)} ms`, '—', true],
  ['load', `${Math.round(perf.load)} ms`, '—', true],
];

console.log('Lighthouse-mobile conditions: 4x CPU, 1.6 Mbps, 150 ms RTT, 412x915\n');
for (const [name, actual, target, ok] of rows) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${String(actual).padStart(10)}   target ${target}`);
}

ws.close();
process.exit(rows.every((r) => r[3]) ? 0 : 1);
