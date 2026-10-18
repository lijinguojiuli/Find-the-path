import test from 'node:test';
import assert from 'node:assert/strict';
import { Maze, MAZE_TYPES, CLASSIC_TYPES, generateMaze, validateSize, parseOptions } from './model.mjs';

function connected(maze) {
  const seen = new Set([maze.startId]), queue = [maze.startId];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head], x = id % maze.cols, y = Math.floor(id / maze.cols);
    for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
      const next = ny * maze.cols + nx;
      if (nx >= 0 && nx < maze.cols && ny >= 0 && ny < maze.rows && !maze.walls[next] && !seen.has(next)) {
        seen.add(next); queue.push(next);
      }
    }
  }
  return seen;
}
// Odd-room and tree invariants belong to the original carving families only.
for (const type of CLASSIC_TYPES) for (const seed of [0, 42, 20261018]) for (const [rows, cols] of [[11, 11], [13, 15], [31, 31]]) {
  test(`生成 ${type} ${rows}×${cols} seed=${seed}：复现、连通、边界`, () => {
    const maze = generateMaze({ rows, cols, type, seed, version: 7 });
    assert.deepEqual(maze, generateMaze({ rows, cols, type, seed, version: 7 }));
    assert.equal(maze.version, 7);
    assert.deepEqual(maze.start, [1, 0]); assert.deepEqual(maze.goal, [cols - 2, rows - 1]);
    const seen = connected(maze);
    assert.ok(seen.has(maze.goalId)); assert.equal(seen.size, maze.walls.filter(v => !v).length);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1)
        assert.equal(maze.walls[y * cols + x], (x === 1 && y === 0) || (x === cols - 2 && y === rows - 1) ? 0 : 1);
      if (x % 2 && y % 2) assert.equal(maze.walls[y * cols + x], 0);
    }
  });
}
test('树形迷宫无环，带环路迷宫确实存在多条通道', () => {
  for (const type of CLASSIC_TYPES) {
    const m = generateMaze({ rows: 31, cols: 31, type, seed: 42 });
    let vertices = 0, edges = 0;
    for (let id = 0; id < m.walls.length; id++) if (!m.walls[id]) {
      vertices++;
      if (id % m.cols < m.cols - 1 && !m.walls[id + 1]) edges++;
      if (id + m.cols < m.walls.length && !m.walls[id + m.cols]) edges++;
    }
    if (type === 'braided') assert.ok(edges > vertices - 1); else assert.equal(edges, vertices - 1);
  }
});
test('非法尺寸、种子、类型、墙体和端点被拒绝；快照独立', () => {
  for (const value of [0, 10, 12, 1003, 11.5, NaN, '31']) assert.throws(() => validateSize(value, 31));
  for (const seed of [-1, 2 ** 32, NaN, 1.2]) assert.throws(() => generateMaze({ seed }));
  assert.throws(() => generateMaze({ type: 'unknown' }));
  assert.throws(() => new Maze(1, 2, { walls: [0, 2], start: [0, 0], goal: [1, 0] }));
  assert.throws(() => new Maze(1, 2, { walls: [0, 1], start: [0, 0], goal: [1, 0] }));
  const m = generateMaze({ rows: 11, cols: 11 }), copy = m.snapshot();
  copy.walls[12] = 1; assert.equal(m.walls[12], 0);
  assert.notDeepEqual(m.walls, generateMaze({ rows: 11, cols: 11, seed: 43 }).walls);
});
test('表单空种子不会被隐式转换为合法的 0，显式 0 可以复现', () => {
  for (const seed of ['', '   ', '-1', '4294967296', 'NaN']) assert.throws(() => parseOptions({ rows: '31', cols: '31', seed, type: 'braided' }));
  assert.deepEqual(parseOptions({ rows: '31', cols: '51', seed: '0', type: 'branches' }), { rows: 31, cols: 51, seed: 0, type: 'branches' });
});
