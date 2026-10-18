import test from 'node:test';
import assert from 'node:assert/strict';
import { Tasks, ResultCache, MazePlayback, minimapTarget } from './state.mjs';
import { generateMaze } from './model.mjs';
import { searchMaze } from './search.mjs';
import { executeRequest, measure } from './worker.mjs';
test('取消、重复请求和版本不匹配均拒绝旧结果', () => {
  const tasks = new Tasks(), first = tasks.begin('search', 1);
  assert.ok(tasks.accepts(first)); assert.equal(tasks.accepts({ ...first, version: 2 }), false);
  tasks.cancel(); assert.equal(tasks.accepts(first), false);
  const second = tasks.begin('search', 1); assert.notEqual(first.id, second.id);
  assert.equal(tasks.finish(first), false); assert.ok(tasks.accepts(second)); assert.ok(tasks.finish(second));
  assert.equal(tasks.accepts(second), false);
});
test('动画暂停、继续、单步、完成、重播和分数时间', () => {
  const result = searchMaze(generateMaze({ rows: 11, cols: 11 })), p = new MazePlayback(121, 10);
  p.load(result); p.update(.05); assert.equal(p.index, 0); p.update(.05); assert.equal(p.index, 1);
  p.toggle(); const before = p.mask.slice(); p.update(100); assert.equal(p.index, 1); assert.deepEqual(p.mask, before);
  p.step(); assert.equal(p.index, 2); assert.equal(p.state, 'paused'); p.toggle(); p.update(.1); assert.equal(p.index, 3);
  assert.equal(p.pathMask.some(Boolean), false); p.finish(); assert.equal(p.state, 'completed');
  for (const id of result.path) assert.equal(p.pathMask[id], 1);
  p.rewind(); assert.equal(p.index, 0); assert.equal(p.mask.some(Boolean), false); assert.equal(p.pathMask.some(Boolean), false);
  p.step(); assert.equal(p.index, 1); p.load(result); assert.equal(p.index, 0);
});
test('缓存最多保留两份轨迹，统计保留八种，读取更新最近使用顺序', () => {
  const cache = new ResultCache();
  for (let i = 0; i < 8; i++) cache.put(String(i), { i }, { i });
  assert.equal(cache.results.size, 2); assert.equal(cache.summaries.size, 8);
  assert.equal(cache.get('0'), undefined); cache.get('6'); cache.put('8', {}, {});
  assert.ok(cache.get('6')); assert.equal(cache.get('7'), undefined);
  cache.clear(); assert.equal(cache.results.size, 0); assert.equal(cache.summaries.size, 0);
});
test('小地图定位边界安全，矩形地图坐标正确', () => {
  const m = { rows: 301, cols: 1001 };
  assert.deepEqual(minimapTarget(0, 0, 320, 200, m), [0, 0]);
  assert.deepEqual(minimapTarget(320, 200, 320, 200, m), [1000, 300]);
  assert.deepEqual(minimapTarget(160, 100, 320, 200, m), [500, 150]);
});
test('计时仅调用两次时钟，排除快照、动画、消息和地图生成', () => {
  const m = generateMaze({ rows: 11, cols: 11 }); let calls = 0;
  const value = measure(m, 'astar', () => ++calls === 1 ? 100 : 112.5);
  assert.equal(calls, 2); assert.equal(value.summary.elapsedMs, 12.5);
  assert.equal(value.summary.totalCost, value.result.path.length - 1);
});
test('Worker 生成、八算法顺序对比、结果缓冲与错误协议', () => {
  const messages = [], emit = m => messages.push(m);
  executeRequest({ id: 1, version: 3, kind: 'generate', options: { rows: 11, cols: 11 } }, emit);
  const map = messages[0].map; assert.equal(map.version, 3); assert.equal(messages[0].kind, 'map');
  messages.length = 0;
  executeRequest({ id: 2, version: 3, kind: 'compare', map, algorithm: 'astar' }, emit);
  assert.equal(messages.filter(m => m.kind === 'measurement').length, 8);
  assert.equal(messages.filter(m => m.result).length, 1); assert.equal(messages.at(-1).kind, 'done');
  assert.ok(messages.every(m => m.id === 2 && m.version === 3));
  messages.length = 0; executeRequest({ id: 3, version: 4, kind: 'search', map, algorithm: 'astar' }, emit);
  assert.equal(messages[0].kind, 'error');
  messages.length = 0; executeRequest({ id: 4, version: 3, kind: 'search', map, algorithm: 'astar' }, emit);
  assert.equal(messages[0].kind, 'result'); assert.ok(messages[0].result.found);
  messages.length = 0; executeRequest({ id: 5, version: 3, kind: 'search', map, algorithm: 'unknown' }, emit);
  assert.equal(messages[0].kind, 'error');
});
