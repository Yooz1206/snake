import test from 'node:test';
import assert from 'node:assert/strict';

import { SnakeGame } from '../js/game.js';
import { CONFIG } from '../js/config.js';

/** A running game with a deterministic board. */
function runningGame() {
  const game = new SnakeGame(CONFIG);
  game.status = 'running';
  return game;
}

test('starts with the configured length and a centred head', () => {
  const game = new SnakeGame(CONFIG);
  assert.equal(game.snake.length, CONFIG.startLength);
  assert.equal(game.status, 'ready');
  assert.deepEqual(game.head, {
    x: Math.floor(CONFIG.cols / 2),
    y: Math.floor(CONFIG.rows / 2),
  });
});

test('a step moves the head one cell in the current direction', () => {
  const game = runningGame();
  const before = { ...game.head };
  game.step();
  assert.deepEqual(game.head, { x: before.x + 1, y: before.y });
  assert.equal(game.snake.length, CONFIG.startLength);
});

test('reversing into itself is rejected', () => {
  const game = runningGame();
  assert.equal(game.queueDirection('left'), false);
  assert.equal(game.queueDirection('right'), false);
  assert.equal(game.pending.length, 0);
});

test('two turns can be buffered and are applied in order', () => {
  const game = runningGame();
  assert.equal(game.queueDirection('up'), true);
  assert.equal(game.queueDirection('left'), true);
  assert.equal(game.queueDirection('down'), false, 'queue is capped');

  game.step();
  assert.deepEqual(game.direction, { x: 0, y: -1 });
  game.step();
  assert.deepEqual(game.direction, { x: -1, y: 0 });
});

test('eating food grows the snake and scores', () => {
  const game = runningGame();
  game.food = { x: game.head.x + 1, y: game.head.y };

  game.step();

  assert.equal(game.snake.length, CONFIG.startLength + 1);
  assert.equal(game.score, CONFIG.scorePerFood);
  assert.equal(game.eaten, 1);
  assert.ok(game.food !== null);
  assert.ok(
    !game.snake.some((segment) => segment.x === game.food.x && segment.y === game.food.y),
    'new food must not spawn inside the snake',
  );
});

test('speed increases with every food but never exceeds the floor', () => {
  const game = runningGame();

  for (let i = 0; i < 80; i += 1) {
    game.snake = [{ x: 2, y: 2 }];
    game.prevSnake = [{ x: 2, y: 2 }];
    game.direction = { x: 1, y: 0 };
    game.food = { x: 3, y: 2 };
    game.status = 'running';
    game.step();
  }

  assert.equal(game.interval, CONFIG.minInterval);
  assert.ok(game.score > 0);
});

test('hitting a wall ends the game', () => {
  const game = runningGame();
  game.snake = [{ x: CONFIG.cols - 1, y: 5 }];
  game.prevSnake = [{ x: CONFIG.cols - 1, y: 5 }];
  game.direction = { x: 1, y: 0 };

  game.step();

  assert.equal(game.status, 'over');
  const events = game.drainEvents();
  assert.equal(events.at(-1).type, 'die');
  assert.equal(events.at(-1).reason, 'wall');
});

test('running into the body ends the game', () => {
  const game = runningGame();
  game.snake = [
    { x: 5, y: 5 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
    { x: 4, y: 5 },
    { x: 4, y: 4 },
  ];
  game.prevSnake = game.snake.map((segment) => ({ ...segment }));
  game.direction = { x: -1, y: 0 };

  game.step();

  assert.equal(game.status, 'over');
  assert.equal(game.drainEvents().at(-1).reason, 'self');
});

test('moving into the vacating tail cell is allowed', () => {
  const game = runningGame();
  game.snake = [
    { x: 5, y: 5 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
    { x: 4, y: 5 },
  ];
  game.prevSnake = game.snake.map((segment) => ({ ...segment }));
  game.direction = { x: -1, y: 0 };
  game.food = { x: 0, y: 0 };

  game.step();

  assert.equal(game.status, 'running');
});

test('a finished game ignores further steps', () => {
  const game = runningGame();
  game.status = 'over';
  const before = JSON.stringify(game.snake);

  game.step();

  assert.equal(JSON.stringify(game.snake), before);
});

test('restart resets score, length and status', () => {
  const game = runningGame();
  game.score = 90;
  game.eaten = 9;
  game.restart();

  assert.equal(game.score, 0);
  assert.equal(game.eaten, 0);
  assert.equal(game.snake.length, CONFIG.startLength);
  assert.equal(game.status, 'running');
  assert.equal(game.interval, CONFIG.baseInterval);
});

test('random play never produces duplicate or out-of-bounds cells', () => {
  const directions = ['up', 'down', 'left', 'right'];

  for (let run = 0; run < 40; run += 1) {
    const game = runningGame();

    for (let step = 0; step < 400 && game.status === 'running'; step += 1) {
      if (Math.random() < 0.35) {
        game.queueDirection(directions[Math.floor(Math.random() * directions.length)]);
      }
      game.step();

      const cells = new Set(game.snake.map((segment) => `${segment.x},${segment.y}`));
      assert.equal(cells.size, game.snake.length, 'snake must not overlap itself');

      for (const segment of game.snake) {
        assert.ok(segment.x >= 0 && segment.x < CONFIG.cols, 'x in bounds');
        assert.ok(segment.y >= 0 && segment.y < CONFIG.rows, 'y in bounds');
      }
    }
  }
});
