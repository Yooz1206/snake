import test from 'node:test';
import assert from 'node:assert/strict';

import { SnakeGame } from '../js/game.js';
import { CONFIG } from '../js/config.js';
import { seedForDate, mulberry32 } from '../js/rng.js';

const DAY = '2026-10-20';

test('the same date seed and the same inputs produce the same run', () => {
  const play = () => {
    const game = new SnakeGame(CONFIG, mulberry32(seedForDate(DAY)));
    game.start();
    game.startDaily(DAY);

    const trace = [];
    for (let i = 0; i < 60; i += 1) {
      if (i % 7 === 0) game.queueDirection('up');
      if (i % 11 === 0) game.queueDirection('right');
      game.step();
      trace.push(JSON.stringify([game.snake, game.food, game.score, game.interval]));
    }
    return trace;
  };

  assert.deepEqual(play(), play());
});

test('different dates diverge on the same input sequence', () => {
  const play = (date) => {
    const game = new SnakeGame(CONFIG, mulberry32(seedForDate(date)));
    game.start();
    const trace = [];
    for (let i = 0; i < 40; i += 1) {
      game.step();
      trace.push(JSON.stringify(game.food));
    }
    return trace;
  };

  assert.notDeepEqual(play('2026-10-20'), play('2026-10-21'));
});

test('a full board wins instead of starving', () => {
  const game = new SnakeGame({ ...CONFIG, cols: 2, rows: 2, startLength: 1 }, () => 0);
  game.status = 'running';
  game.snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
  game.prevSnake = game.snake.map((segment) => ({ ...segment }));
  game.direction = { x: 0, y: 1 };
  game.food = { x: 0, y: 1 };

  game.step();

  assert.equal(game.status, 'won');
  assert.equal(game.food, null, 'no food left on a full board');
  assert.equal(game.drainEvents().at(-1).type, 'win');

  const before = JSON.stringify(game.snake);
  game.step();
  assert.equal(JSON.stringify(game.snake), before, 'a won game stops advancing');
});

test('countdown ignores steps and cannot kill the snake', () => {
  const game = new SnakeGame(CONFIG);
  game.start();
  game.pause();
  game.beginCountdown();

  game.snake = [{ x: CONFIG.cols - 1, y: 5 }];
  game.direction = { x: 1, y: 0 };
  game.step();

  assert.equal(game.status, 'countdown');
  assert.notEqual(game.status, 'over');

  game.endCountdown();
  assert.equal(game.status, 'running');
});

test('the first restart press only pauses, a second one inside the window restarts', () => {
  const game = new SnakeGame(CONFIG);
  game.start();
  game.score = 50;

  assert.equal(game.pressRestart(1000, false), 'paused');
  assert.equal(game.score, 50, 'pausing must not reset the run');
  assert.equal(game.pressRestart(2500, false), 'restarted');
  assert.equal(game.score, 0);
  assert.equal(game.status, 'running');
});

test('a late second press re-arms the guard instead of restarting', () => {
  const game = new SnakeGame(CONFIG);
  game.start();

  assert.equal(game.pressRestart(1000, false), 'paused');
  assert.equal(game.pressRestart(3500, false), 'paused', '2.5s later is outside the window');
  assert.equal(game.pressRestart(3600, false), 'restarted');
});

test('daily mode never restarts from the keyboard', () => {
  const game = new SnakeGame(CONFIG);
  game.start();
  game.startDaily(DAY);
  game.score = 80;

  assert.equal(game.pressRestart(1000, true), 'paused');
  assert.equal(game.pressRestart(1100, true), 'paused');
  assert.equal(game.score, 80);
  assert.equal(game.runDate, DAY);
});

test('quitting ends the run with a quit reason', () => {
  const game = new SnakeGame(CONFIG);
  game.start();
  game.score = 30;
  game.quit();

  assert.equal(game.status, 'over');
  const event = game.drainEvents().at(-1);
  assert.equal(event.type, 'die');
  assert.equal(event.reason, 'quit');
});

test('quitting from ready does nothing', () => {
  const game = new SnakeGame(CONFIG);
  game.quit();
  assert.equal(game.status, 'ready');
});
