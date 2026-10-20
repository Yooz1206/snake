import test from 'node:test';
import assert from 'node:assert/strict';

import { shareCopy, cardFileName, shareResult } from '../js/share.js';

const URL = 'https://yooo1206.github.io/snake/?from=share';

test('the copy line carries the score, streak and link but never the seed', () => {
  const copy = shareCopy({ date: '2026-10-20', best: 240, streak: 3, url: URL });
  assert.equal(copy, `Snake 每日挑战 10月20日：240 分，连续 3 天。来玩今天的 → ${URL}`);
  assert.ok(!/seed|种子|snake:v1/i.test(copy), 'no seed in the share text');
});

test('the attempt number is shown when supplied (OQ2)', () => {
  const copy = shareCopy({ date: '2026-10-20', best: 240, streak: 3, attempt: 2, url: URL });
  assert.equal(copy, `Snake 每日挑战 10月20日：240 分（第 2 次），连续 3 天。来玩今天的 → ${URL}`);
});

test('the file name is date and score', () => {
  assert.equal(cardFileName({ date: '2026-10-20', best: 240 }), 'snake-2026-10-20-240.png');
});

test('sharing prefers the system sheet', async () => {
  const calls = [];
  const outcome = await shareResult(
    { copy: 'x', fileName: 'snake.png', blob: {}, file: { name: 'snake.png' } },
    {
      share: async (payload) => { calls.push(payload); },
      canShare: () => true,
      download: async () => { throw new Error('should not download'); },
      copyText: async () => { throw new Error('should not copy'); },
    },
  );

  assert.equal(outcome, 'shared');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].files.length, 1);
});

test('cancelling the system sheet is silent', async () => {
  const outcome = await shareResult(
    { copy: 'x', fileName: 'snake.png', blob: {}, file: { name: 'snake.png' } },
    {
      share: async () => {
        const error = new Error('cancel');
        error.name = 'AbortError';
        throw error;
      },
      canShare: () => true,
      download: async () => { throw new Error('should not download'); },
      copyText: async () => { throw new Error('should not copy'); },
    },
  );

  assert.equal(outcome, 'cancelled');
});

test('without file sharing it downloads the card', async () => {
  const downloaded = [];
  const outcome = await shareResult(
    { copy: 'x', fileName: 'snake-2026-10-20-240.png', blob: {} },
    {
      share: null,
      canShare: null,
      download: async (blob, name) => { downloaded.push(name); },
      copyText: async () => { throw new Error('should not copy'); },
    },
  );

  assert.equal(outcome, 'downloaded');
  assert.deepEqual(downloaded, ['snake-2026-10-20-240.png']);
});

test('when the download fails the text copy is the last resort', async () => {
  const copied = [];
  const outcome = await shareResult(
    { copy: 'Snake 每日挑战', fileName: 'snake.png', blob: {} },
    {
      share: null,
      canShare: null,
      download: async () => { throw new Error('blocked'); },
      copyText: async (text) => { copied.push(text); },
    },
  );

  assert.equal(outcome, 'copied');
  assert.deepEqual(copied, ['Snake 每日挑战']);
});
