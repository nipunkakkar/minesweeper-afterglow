import test from 'node:test';
import assert from 'node:assert/strict';
import { Minesweeper, PRESETS } from '../game.js';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Known layouts let the rule tests exercise actual decisions, independent of random placement.
function field(mines = [0, 24]) {
  const game = new Minesweeper({ rows: 5, cols: 5, mines: mines.length });
  game.cells.forEach((cell, index) => {
    cell.mine = mines.includes(index);
    const row = Math.floor(index / 5), col = index % 5;
    cell.adjacent = mines.filter(mine => mine !== index && Math.abs(Math.floor(mine / 5) - row) <= 1 && Math.abs(mine % 5 - col) <= 1).length;
  });
  game.status = 'playing';
  return game;
}

test('all presets place the exact mine count and protect the first square and its neighbors', () => {
  for (const preset of Object.values(PRESETS)) {
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Minesweeper({ ...preset, random: seeded(seed) });
      const first = (seed * 19) % game.cells.length;
      game.reveal(first);
      assert.equal(game.cells.filter(cell => cell.mine).length, preset.mines);
      assert.equal(game.cells[first].adjacent, 0);
      assert.ok(game.neighbors(first, true).every(index => !game.cells[index].mine));
      assert.notEqual(game.status, 'lost');
      game.cells.forEach((cell, index) => {
        const row = Math.floor(index / game.cols), col = index % game.cols;
        const actual = game.cells.filter((other, otherIndex) => other.mine && otherIndex !== index && Math.abs(Math.floor(otherIndex / game.cols) - row) <= 1 && Math.abs(otherIndex % game.cols - col) <= 1).length;
        assert.equal(cell.adjacent, actual);
      });
    }
  }
});

test('neighbors never wrap between rows or leave the board', () => {
  const game = field();
  assert.deepEqual(game.neighbors(0), [1, 5, 6]);
  assert.deepEqual(game.neighbors(4), [3, 8, 9]);
  assert.deepEqual(game.neighbors(24, true), [18, 19, 23, 24]);
});

test('flags do not start the clock state, plant mines or uncover squares', () => {
  const game = new Minesweeper();
  assert.equal(game.toggleFlag(0), true);
  assert.equal(game.flagCount, 1);
  assert.equal(game.reveal(0).type, 'noop');
  assert.equal(game.status, 'ready');
  assert.ok(game.cells.every(cell => !cell.mine && !cell.revealed));
  game.toggleFlag(0);
  assert.equal(game.flagCount, 0);
  game.reveal(0);
  assert.equal(game.toggleFlag(0), false);
});

test('flood fill opens connected safe squares and respects flags', () => {
  const game = field();
  game.toggleFlag(12);
  const result = game.reveal(13);
  assert.equal(result.type, 'revealed');
  assert.equal(game.revealedCount, 22);
  assert.equal(game.cells[12].revealed, false);
  assert.ok(game.cells.filter(cell => cell.mine).every(cell => !cell.revealed));
  game.toggleFlag(12);
  assert.equal(game.reveal(12).type, 'won');
  assert.equal(game.revealedCount, 23);
  assert.equal(game.flagCount, 2);
});

test('a number only clears its neighbors when the adjacent flag count matches', () => {
  const game = field();
  game.reveal(1);
  assert.equal(game.reveal(1).type, 'noop');
  assert.equal(game.revealedCount, 1);
  game.toggleFlag(0);
  const result = game.reveal(1);
  assert.notEqual(result.type, 'noop');
  assert.notEqual(result.type, 'lost');
  assert.ok(game.cells[2].revealed && game.cells[5].revealed && game.cells[6].revealed && game.cells[7].revealed);
});

test('incorrect flags can cause a loss when clearing around a number', () => {
  const game = field();
  game.reveal(1); game.toggleFlag(2);
  assert.equal(game.reveal(1).type, 'lost');
  assert.equal(game.cells[0].exploded, true);
  assert.equal(game.cells[2].flagged, true);
});

test('sonar includes flagged mines, clips at edges and never uncovers or relocates squares', () => {
  const game = field([0, 6, 24]);
  game.toggleFlag(0);
  const before = structuredClone(game.cells);
  const scan = game.scan(0);
  assert.equal(scan.mines, 2);
  assert.deepEqual(scan.area, [0, 1, 5, 6]);
  assert.deepEqual(game.cells, before);
  assert.equal(game.charges, 2);
  assert.equal(game.scan(12).area.length, 9);
  assert.equal(game.scan(24).mines, 1);
  assert.equal(game.charges, 0);
  assert.equal(game.scan(12), null);
});

test('completed games reject further reveals, flags and scans', () => {
  for (const finish of ['won', 'lost']) {
    const game = field();
    game.reveal(finish === 'won' ? 12 : 0);
    assert.equal(game.status, finish);
    const before = structuredClone(game.cells);
    assert.equal(game.reveal(2).type, 'noop');
    assert.equal(game.toggleFlag(2), false);
    assert.equal(game.scan(2), null);
    assert.deepEqual(game.cells, before);
  }
});

test('invalid coordinates and pre-opening sonar cannot mutate a game', () => {
  const game = new Minesweeper();
  for (const index of [-1, 81, 1.5, NaN, undefined]) {
    assert.equal(game.reveal(index).type, 'noop');
    assert.equal(game.toggleFlag(index), false);
    assert.equal(game.scan(index), null);
  }
  assert.equal(game.scan(0), null);
  assert.equal(game.status, 'ready');
  assert.equal(game.charges, 3);
  assert.throws(() => new Minesweeper({ rows: 4, cols: 4, mines: 8 }), RangeError);
});

test('every safe square can be uncovered to win across many generated boards', () => {
  for (const preset of Object.values(PRESETS)) {
    for (let seed = 0; seed < 30; seed++) {
      const game = new Minesweeper({ ...preset, random: seeded(seed + 100) });
      game.reveal(Math.floor(game.cells.length / 2));
      game.cells.forEach((cell, index) => { if (!cell.mine && !cell.revealed) game.reveal(index); });
      assert.equal(game.status, 'won');
      assert.equal(game.revealedCount, game.cells.length - preset.mines);
    }
  }
});
