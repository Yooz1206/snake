// Drive the running game over the Chrome DevTools Protocol to verify that
// keyboard input actually starts the game and moves the snake.
import fs from 'node:fs';

const ENDPOINT = process.env.CDP || 'http://127.0.0.1:9333';
const SHOT = process.argv[2] || 'cdp-shot.png';

const targets = await (await fetch(`${ENDPOINT}/json/list`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('8123'))
  ?? targets.find((target) => target.type === 'page');
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

async function key(key, code, keyCode) {
  await send('Input.dispatchKeyEvent', {
    type: key === ' ' ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
}

await send('Page.enable');
await send('Page.bringToFront');
await send('Runtime.enable');

const read = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  return result.result?.result?.value;
};

console.log('initial overlay:', await read('document.getElementById("overlay").className'));

await key(' ', 'Space', 32);
await sleep(600);
console.log('after space  :', await read('document.getElementById("overlay").className'));

await sleep(500);
await key('ArrowUp', 'ArrowUp', 38);
await sleep(700);
await key('ArrowLeft', 'ArrowLeft', 37);
await sleep(900);

console.log('score        :', await read('document.getElementById("score").textContent'));
console.log('canvas w/h   :', await read('document.getElementById("game").width + "x" + document.getElementById("game").height'));

const screenshot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(SHOT, Buffer.from(screenshot.result.data, 'base64'));
console.log('screenshot   :', SHOT);

socket.close();
process.exit(0);
