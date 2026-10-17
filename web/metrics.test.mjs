import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from './model.mjs';
import { measureSearch, compareAlgorithms } from './metrics.mjs';
import { SearchPlayback } from './playback.mjs';

test('统计基于同一地图，算法使用独立计时窗口', () => {
  const grid = new Grid(3, 3, { start: [0, 0], goal: [2, 0], obstacles: [[1, 0], [1, 1]] });
  const before = grid.snapshot(), times = [0, 7, 1000, 1011, 2000, 2013];
  const rows = compareAlgorithms(grid, () => times.shift());
  assert.deepEqual(rows.map(row => row.pathLength), [6, 6, 6]);
  assert.deepEqual(rows.map(row => row.elapsedMs), [7, 11, 13]);
  assert.deepEqual(grid.snapshot(), before);
});
test('长时间播放及暂停不改变记录的算法耗时', () => {
  const times = [10, 12], grid = new Grid(1, 5, { start: [0, 0], goal: [4, 0] });
  for (let i = 0; i < 3; i++) {
    const clock = [...times];
    const measurement = measureSearch(grid, 'astar', () => clock.shift());
    const playback = new SearchPlayback();
    playback.load(measurement.result); playback.pause(); playback.update(10000); playback.step();
    assert.equal(measurement.elapsedMs, 2);
  }
});
test('不可达步数为空，同起终点为零，真实计时仅检查有限非负', () => {
  const blocked = new Grid(1, 3, { start: [0, 0], goal: [2, 0], obstacles: [[1, 0]] });
  assert.equal(measureSearch(blocked, 'bfs').pathLength, null);
  const same = measureSearch(new Grid(1, 1, { start: [0, 0], goal: [0, 0] }), 'astar');
  assert.equal(same.pathLength, 0);
  assert(Number.isFinite(same.elapsedMs) && same.elapsedMs >= 0);
});
