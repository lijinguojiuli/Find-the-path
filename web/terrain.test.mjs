import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, MODES, applyEdit } from './model.mjs';
import { searchGrid } from './search.mjs';
import { compareAlgorithms } from './metrics.mjs';

test('较短路线成本 16，Dijkstra 和 A* 选择六步成本 6 的路线', () => {
  const grid = new Grid(3, 5, { start: [0, 1], goal: [4, 1], costs: [[1, 1, 5], [2, 1, 5], [3, 1, 5]] });
  const rows = compareAlgorithms(grid);
  assert.deepEqual(rows.map(row => row.pathLength), [4, 6, 6]);
  assert.deepEqual(rows.map(row => row.totalCost), [16, 6, 6]);
});
test('成本计入终点而不计起点，同起终点成本为零', () => {
  const grid = new Grid(1, 2, { start: [0, 0], goal: [1, 0], costs: [[0, 0, 9], [1, 0, 5]] });
  for (const algorithm of ['bfs', 'dijkstra', 'astar']) {
    assert.equal(searchGrid(grid, algorithm).totalCost, 5);
    const same = new Grid(1, 1, { start: [0, 0], goal: [0, 0], costs: [[0, 0, 5]] });
    assert.equal(searchGrid(same, algorithm).totalCost, 0);
  }
});
test('地形工具、端点、障碍拒绝、清除与快照恢复', () => {
  const grid = new Grid(2, 3, { start: [0, 0], goal: [2, 1], obstacles: [[1, 0]] });
  assert.equal(applyEdit(grid, MODES.terrain, [1, 0]).changed, false);
  assert.equal(applyEdit(grid, MODES.terrain, [0, 0]).changed, true);
  assert.equal(grid.costAt([0, 0]), 5);
  assert.equal(applyEdit(grid, MODES.terrain, [0, 0]).changed, false);
  const saved = grid.snapshot(); grid.costs.clear();
  assert.equal(grid.costAt([0, 0]), 5);
  applyEdit(grid, MODES.plain, [0, 0]); assert.equal(grid.costAt([0, 0]), 1);
  assert.deepEqual(new Grid(saved.rows, saved.cols, saved).snapshot(), saved);
  grid.setCost([1, 1], 5); grid.addObstacle([1, 1]); grid.removeObstacle([1, 1]);
  assert.equal(grid.costAt([1, 1]), 1);
});
for (const cost of [0, -1, true, 1.5, '5', NaN, Infinity]) {
  test(`拒绝非法成本 ${cost}`, () => assert.throws(() => new Grid(1, 1).setCost([0, 0], cost)));
}
test('128 种地形布局中 A* 与 Dijkstra 最低成本一致', () => {
  const cells = [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]];
  for (let mask = 0; mask < 128; mask++) {
    const costs = cells.filter((_, i) => mask & (1 << i)).map(([x, y]) => [x, y, 5]);
    const grid = new Grid(3, 3, { start: [0, 0], goal: [2, 2], costs });
    assert.equal(searchGrid(grid, 'astar').totalCost, searchGrid(grid, 'dijkstra').totalCost);
  }
});
test('全高成本地图可使用缩放后的曼哈顿下界', () => {
  const grid = new Grid(1, 3, { start: [0, 0], goal: [2, 0], costs: [[0, 0, 5], [1, 0, 5], [2, 0, 5]] });
  assert.equal(grid.minimumCost, 5);
  assert.equal(searchGrid(grid, 'astar').totalCost, 10);
  grid.setCost([1, 0], 1); assert.equal(grid.minimumCost, 1);
});
