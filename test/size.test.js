import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Static imports only: `await import('./share.js')` must stay out. */
const STATIC_IMPORT = /^import\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm;

function walkModules(entry) {
  const seen = new Set();
  const stack = [entry];

  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(STATIC_IMPORT)) {
      stack.push(path.posix.join(path.posix.dirname(file), match[1]));
    }
  }

  return seen;
}

const modules = [...walkModules('js/main.js')].sort();
const assets = ['index.html', 'css/style.css', ...modules];
const totalBytes = assets.reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

test('the share card stays out of the first paint', () => {
  assert.ok(!modules.includes('js/share.js'), 'share.js must only be reached through a dynamic import');
  assert.ok(assets.every((file) => !file.endsWith('share.js')));
});

test('first paint does not grow past the v1.1 ceiling', () => {
  // Regression guard with a little headroom over the measured size, so an
  // accidental import fails CI instead of quietly blowing the budget.
  assert.ok(totalBytes < 44 * 1024, `first paint is ${kb(totalBytes)}, ceiling is 44KB`);
});

test('first paint meets the PRD 42KB budget', () => {
  assert.ok(totalBytes <= 42 * 1024, `first paint is ${kb(totalBytes)} of 42KB`);
});
