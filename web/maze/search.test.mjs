import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Maze, generateMaze, randomSource } from './model.mjs';
import { ALGORITHMS, searchMaze, iterSearch } from './search.mjs';
const fixtures = JSON.parse(readFileSync(new URL('../../tests/fixtures/maze-cases.json', import.meta.url)));
export function reference(m) {
  const queue = [[...m.start, 0]], seen = new Set([String(m.start)]);
  for (let head = 0; head < queue.length; head++) {
    const [x, y, distance] = queue[head];
    if (x === m.goal[0] && y === m.goal[1]) return distance;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (nx >= 0 && nx < m.cols && ny >= 0 && ny < m.rows && !m.walls[ny * m.cols + nx] && !seen.has(key)) {
        seen.add(key); queue.push([nx, ny, distance + 1]);
      }
    }
  }
  return null;
}
export function checkPath(m, r, expected, optimal) {
  assert.equal(r.found, expected !== null);
  assert.equal(r.visitedCount, r.visitedOrder.length);
  assert.equal(r.visitedCount, new Set(r.visitedOrder).size);
  assert.equal(r.visitedCount, r.visitedSides.length);
  for (const id of r.visitedOrder) assert.equal(m.walls[id], 0);
  for (const side of r.visitedSides) assert.ok(side === 1 || side === 2);
  if (!r.found) { assert.equal(r.path.length, 0); assert.equal(r.totalCost, null); return; }
  assert.equal(r.path[0], m.startId); assert.equal(r.path.at(-1), m.goalId);
  assert.equal(r.totalCost, r.path.length - 1);
  assert.equal(new Set(r.path).size, r.path.length);
  for (let i = 0; i < r.path.length; i++) {
    const id = r.path[i]; assert.equal(m.walls[id], 0);
    if (i) { const before = r.path[i - 1]; assert.equal(Math.abs(before % m.cols - id % m.cols) + Math.abs(Math.floor(before / m.cols) - Math.floor(id / m.cols)), 1); }
  }
  if (optimal) assert.equal(r.totalCost, expected); else assert.ok(r.totalCost >= expected);
}
for (const fixture of fixtures) for (const [algorithm, info] of Object.entries(ALGORITHMS)) {
  test(`${algorithm}：${fixture.name} 路径合法并符合最优性约定`, () => {
    const m = new Maze(fixture.cells.length, fixture.cells[0].length, {
      walls: fixture.cells.flatMap(row => [...row].map(v => v === '#' ? 1 : 0)), start: fixture.start, goal: fixture.goal,
    });
    checkPath(m, searchMaze(m, algorithm), reference(m), info.optimal);
  });
}
test('固定种子的 150 张随机地图，八算法对照独立参考并检查路径', () => {
  const random = randomSource(20261018);
  for (let i = 0; i < 150; i++) {
    const rows = 2 + random() % 12, cols = 2 + random() % 13;
    const walls = Uint8Array.from({ length: rows * cols }, () => random() % 100 < 32 ? 1 : 0); walls[0] = walls[walls.length - 1] = 0;
    const m = new Maze(rows, cols, { walls, start: [0, 0], goal: [cols - 1, rows - 1] }), expected = reference(m);
    for (const [algorithm, info] of Object.entries(ALGORITHMS)) checkPath(m, searchMaze(m, algorithm), expected, info.optimal);
  }
});
test('不保证最短的三算法存在实际反例', () => {
  const worse = new Set();
  for (let seed = 0; seed < 50 && worse.size < 3; seed++) {
    const m = generateMaze({ rows: 31, cols: 31, seed }), optimal = reference(m);
    for (const algorithm of ['dfs', 'greedy', 'weighted']) if (searchMaze(m, algorithm).totalCost > optimal) worse.add(algorithm);
  }
  assert.deepEqual(worse, new Set(['dfs', 'greedy', 'weighted']));
});
test('调用时捕获快照、重复搜索稳定，迭代结果与收集结果一致', () => {
  const m = generateMaze({ rows: 11, cols: 11 }), original = m.snapshot();
  const steps = iterSearch(m, 'astar'); m.walls.fill(1);
  const events = []; let step;
  do { step = steps.next(); if (!step.done) events.push(step.value); } while (!step.done);
  assert.deepEqual(step.value, searchMaze(original, 'astar'));
  assert.deepEqual(events.map(e => e.id), [...step.value.visitedOrder]);
  assert.deepEqual(searchMaze(original, 'bibfs'), searchMaze(original, 'bibfs'));
  assert.throws(() => searchMaze(original, 'unknown'));
});
test('回归：迭代加深在带环的12×12地图中不重复消耗同深度分支预算', () => {
  const random = randomSource(20261018); let m;
  for (let i = 0; i <= 31; i++) {
    const rows = 2 + random() % 12, cols = 2 + random() % 13;
    const walls = Uint8Array.from({ length: rows * cols }, () => random() % 100 < 32 ? 1 : 0); walls[0] = walls[walls.length - 1] = 0;
    m = new Maze(rows, cols, { walls, start: [0, 0], goal: [cols - 1, rows - 1] });
  }
  const r = searchMaze(m, 'iddfs'); assert.equal(r.status, 'found'); assert.equal(r.totalCost, reference(m));
});
test('六种教学算法预算耗尽明确返回 limited，不能称为不可达', () => {
  const m=generateMaze({rows:15,cols:25});
  for(const a of ['spfa','bellmanford','iddfs','idastar','beam','bigreedy']) {
    const r=searchMaze(m,a,{maxExpansions:1}); assert.equal(r.status,'limited'); assert.ok(r.reason);
    assert.equal(r.found,false); assert.equal(r.totalCost,null); assert.equal(r.path.length,0);
  }
});
test('窄束确实会舍弃可行路线；扩大束宽可找到原路线', () => {
  const cells=['.......','.#####.','...#...','#######','#######'];
  const m=new Maze(5,7,{walls:cells.flatMap(r=>[...r].map(c=>c==='#'?1:0)),start:[0,2],goal:[6,2]});
  assert.equal(searchMaze(m,'beam',{beamWidth:1}).status,'limited');
  const r=searchMaze(m,'beam'); assert.ok(r.found); checkPath(m,r,reference(m),false);
});
