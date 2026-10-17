import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from './model.mjs';
import { searchGrid } from './search.mjs';
import { SearchPlayback } from './playback.mjs';

for (const algorithm of ['bfs', 'dijkstra', 'astar']) {
  test(`${algorithm} 返回四方向最短绕行路径和访问顺序`, () => {
    const grid = new Grid(3, 3, { start: [0, 0], goal: [2, 0], obstacles: [[1, 0], [1, 1]] });
    const before = grid.snapshot(), result = searchGrid(grid, algorithm);
    assert.equal(result.found, true);
    assert.equal(result.path.length - 1, 6);
    assert.deepEqual(result.path[0], grid.start);
    assert.deepEqual(result.path.at(-1), grid.goal);
    assert.equal(result.visitedCount, new Set(result.visitedOrder.map(String)).size);
    result.path.forEach((cell, index) => {
      assert(grid.inBounds(cell) && !grid.isBlocked(cell));
      if (index) assert.equal(Math.abs(cell[0] - result.path[index - 1][0]) + Math.abs(cell[1] - result.path[index - 1][1]), 1);
    });
    assert.deepEqual(grid.snapshot(), before);
  });
  test(`${algorithm} 同起终点为零步，不可达不穿对角线`, () => {
    const same = searchGrid(new Grid(1, 1, { start: [0, 0], goal: [0, 0] }), algorithm);
    assert.deepEqual(same.path, [[0, 0]]);
    assert.equal(same.visitedCount, 1);
    const blocked = searchGrid(new Grid(2, 2, { start: [0, 0], goal: [1, 1], obstacles: [[0, 1], [1, 0]] }), algorithm);
    assert.equal(blocked.found, false);
    assert.deepEqual(blocked.path, []);
  });
}
test('三种算法在全部 128 种小地图中最短长度一致', () => {
  const cells = [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]];
  for (let mask = 0; mask < 128; mask++) {
    const grid = new Grid(3, 3, { start: [0, 0], goal: [2, 2], obstacles: cells.filter((_, i) => mask & (1 << i)) });
    const results = ['bfs', 'dijkstra', 'astar'].map(name => searchGrid(grid, name));
    assert(results.every(r => r.found === results[0].found && r.path.length === results[0].path.length));
  }
});
test('拒绝未知算法及缺少端点', () => {
  assert.throws(() => searchGrid(new Grid(2, 2)), /起点/);
  assert.throws(() => searchGrid(new Grid(2, 2), 'unknown'), /算法/);
});
const trace = () => searchGrid(new Grid(1, 5, { start: [0, 0], goal: [4, 0] }));
test('播放访问顺序，最后才显示完整路径', () => {
  const playback = new SearchPlayback(2), result = trace();
  playback.load(result);
  playback.update(.5);
  assert.deepEqual(playback.visited, result.visitedOrder.slice(0, 1));
  assert.deepEqual(playback.path, []);
  playback.update(2);
  assert.equal(playback.state, 'completed');
  assert.deepEqual(playback.path, result.path);
});
test('暂停不积累时间，单步恰好一格，再继续', () => {
  const playback = new SearchPlayback(2);
  playback.load(trace()); playback.update(.5); playback.pause(); playback.update(100);
  assert.equal(playback.index, 1);
  playback.step(); assert.equal(playback.index, 2); assert.equal(playback.state, 'paused');
  playback.resume(); playback.update(.5); assert.equal(playback.index, 3);
});
test('调速、低帧率、重置和重复搜索互不污染', () => {
  const playback = new SearchPlayback(1);
  playback.load(trace()); playback.update(.5); playback.setRate(10); playback.update(.5);
  assert.equal(playback.state, 'completed');
  playback.step(); assert.equal(playback.index, 5);
  playback.reset(); assert.equal(playback.state, 'idle'); assert.deepEqual(playback.path, []);
  playback.load(trace(), false); playback.update(10); assert.equal(playback.index, 0);
  playback.step(); assert.equal(playback.index, 1);
});
test('动画按时间推进而非帧数，拒绝非法输入', () => {
  const first = new SearchPlayback(2), second = new SearchPlayback(2);
  first.load(trace()); second.load(trace()); first.update(1);
  for (let i = 0; i < 10; i++) second.update(.1);
  assert.equal(first.index, second.index);
  for (const value of [-1, Infinity, NaN]) assert.throws(() => first.update(value));
  for (const value of [0, -1, Infinity, 2001]) assert.throws(() => first.setRate(value));
});
