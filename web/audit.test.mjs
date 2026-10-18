import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from './model.mjs';
import { searchGrid } from './search.mjs';

function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}
function validate(grid, result, context) {
  assert.equal(result.visitedCount, result.visitedOrder.length, context);
  for (const cell of [...result.path, ...result.visitedOrder]) assert(grid.inBounds(cell) && !grid.isBlocked(cell), context);
  if (!result.found) { assert.deepEqual(result.path, [], context); assert.equal(result.totalCost, null, context); return; }
  assert.deepEqual(result.path[0], grid.start, context); assert.deepEqual(result.path.at(-1), grid.goal, context);
  assert.equal(new Set(result.path.map(String)).size, result.path.length, context);
  for (let i = 1; i < result.path.length; i++) assert.equal(Math.abs(result.path[i][0] - result.path[i - 1][0]) + Math.abs(result.path[i][1] - result.path[i - 1][1]), 1, context);
  assert.equal(result.totalCost, result.path.slice(1).reduce((cost, cell) => cost + grid.costAt(cell), 0), context);
}

for (const seed of [0, 7, 42, 20261018]) {
  test(`固定种子 ${seed}：20 张网页地图的最优成本及内存快照往返一致`, () => {
    const random = seeded(seed), integer = limit => Math.floor(random() * limit);
    for (let index = 0; index < 20; index++) {
      const rows = 1 + integer(12), cols = 1 + integer(12), start = [integer(cols), integer(rows)];
      const goal = index % 7 === 0 ? [...start] : [integer(cols), integer(rows)];
      const obstacles = [], costs = [], density = [0, .2, .4, .6][index % 4];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (String([x, y]) !== String(start) && String([x, y]) !== String(goal) && random() < density) obstacles.push([x, y]);
        else { const cost = [1, 2, 5, 9][integer(4)]; if (cost !== 1) costs.push([x, y, cost]); }
      }
      const grid = new Grid(rows, cols, { start, goal, obstacles, costs });
      const snapshot = grid.snapshot(), context = `seed=${seed}, map=${index}`;
      const first = searchGrid(grid, 'astar'), second = searchGrid(grid, 'dijkstra');
      validate(grid, first, context); validate(grid, second, context);
      assert.equal(first.found, second.found, context); assert.equal(first.totalCost, second.totalCost, context);
      assert.deepEqual(grid.snapshot(), snapshot, context);
      // This checks existing snapshot data, not an unimplemented file persistence API.
      const data = JSON.parse(JSON.stringify(snapshot));
      const restored = new Grid(data.rows, data.cols, data);
      assert.deepEqual(restored.snapshot(), snapshot, context);
      assert.deepEqual(searchGrid(restored, 'astar'), first, context);
      assert.deepEqual(searchGrid(restored, 'dijkstra'), second, context);
    }
  });
}
