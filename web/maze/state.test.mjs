import test from 'node:test';
import assert from 'node:assert/strict';
import { Tasks, ResultCache, MazePlayback, PairPlayback, minimapTarget, fitGeometry, compareSummaries } from './state.mjs';
import { Maze,generateMaze } from './model.mjs';
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
test('缓存最多保留两份轨迹，十四种统计均保留，读取更新最近使用顺序', () => {
  const cache = new ResultCache();
  for (let i = 0; i < 14; i++) cache.put(String(i), { i }, { i });
  assert.equal(cache.results.size, 2); assert.equal(cache.summaries.size, 14);
  assert.equal(cache.get('0'), undefined); cache.get('12'); cache.put('14', {}, {});
  assert.ok(cache.get('12')); assert.equal(cache.get('13'), undefined);
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
test('Worker 生成、十四算法顺序对比、结果缓冲与错误协议', () => {
  const messages = [], emit = m => messages.push(m);
  executeRequest({ id: 1, version: 3, kind: 'generate', options: { rows: 11, cols: 11 } }, emit);
  const map = messages[0].map; assert.equal(map.version, 3); assert.equal(messages[0].kind, 'map');
  messages.length = 0;
  executeRequest({ id: 2, version: 3, kind: 'compare', map, algorithm: 'astar' }, emit);
  assert.equal(messages.filter(m => m.kind === 'measurement').length, 14);
  assert.equal(messages.filter(m => m.result).length, 1); assert.equal(messages.at(-1).kind, 'done');
  assert.ok(messages.every(m => m.id === 2 && m.version === 3));
  messages.length = 0; executeRequest({ id: 3, version: 4, kind: 'search', map, algorithm: 'astar' }, emit);
  assert.equal(messages[0].kind, 'error');
  messages.length = 0; executeRequest({ id: 4, version: 3, kind: 'search', map, algorithm: 'astar' }, emit);
  assert.equal(messages[0].kind, 'result'); assert.ok(messages[0].result.found);
  messages.length = 0; executeRequest({ id: 5, version: 3, kind: 'search', map, algorithm: 'unknown' }, emit);
  assert.equal(messages[0].kind, 'error');
});
test('完整视图在窄窗口同时容纳起终点，百万格不产生无限坐标', () => {
  for (const [rows, cols, width, height] of [[15,25,605,364],[31,31,400,300],[1001,1001,600,350]]) {
    const g = fitGeometry(rows, cols, width, height);
    assert.ok(g.size > 0 && Number.isFinite(g.size));
    assert.ok(g.left >= 0 && g.top >= 0);
    assert.ok(g.left + cols * g.size <= width && g.top + rows * g.size <= height);
  }
  assert.ok(fitGeometry(15,25,605,364).size >= 16);
});
test('差异统计只比较真实同图结果，未知路径和零探索不会变成百分比假结果', () => {
  const a = { found:true, pathLength:36, visitedCount:67 }, b = { found:true, pathLength:36, visitedCount:131 };
  const d = compareSummaries(a,b); assert.equal(d.pathDelta,0); assert.equal(d.visitedDelta,-64);
  assert.ok(d.explorationReduction > 48 && d.explorationReduction < 49);
  assert.equal(compareSummaries(a,null).ready,false);
  assert.equal(compareSummaries(a,{found:false,visitedCount:0}).pathDelta,null);
  assert.equal(compareSummaries(a,{found:false,visitedCount:0}).explorationReduction,null);
});
test('两算法对比只返回选择的两种轨迹，仍使用同一版本地图', () => {
  const map = generateMaze({ rows:15,cols:25,version:9 }), out=[];
  executeRequest({id:10,version:9,kind:'pair',map,algorithm:'dfs',reference:'astar'},m=>out.push(m));
  const values=out.filter(m=>m.kind==='measurement');
  assert.deepEqual(values.map(m=>m.algorithm),['dfs','astar']); assert.ok(values.every(m=>m.result && m.version===9));
  assert.ok(values[0].summary.pathLength > values[1].summary.pathLength);
});
test('回归：普通搜索立即返回单次结果，对比实验仍采样五次',()=>{
  const map=generateMaze({rows:15,cols:25,version:6}),out=[];let ticks=0;
  executeRequest({id:11,version:6,kind:'search',map,algorithm:'astar'},m=>out.push(m),()=>++ticks);
  assert.equal(ticks,2,'普通搜索只测量一次，不等待热身与多次采样');
  assert.equal(out.length,1);const {result,summary}=out[0];assert.equal(out[0].kind,'result');
  assert.equal(summary.sampleCount,1);assert.equal(summary.warmupCount,0);assert.equal(summary.timingKind,'single');
  assert.equal(summary.includesDetails,true);assert.ok(result.teachingFrames.length);assert.equal(summary.totalCost,result.path.length-1);
  const pair=[];executeRequest({id:12,version:6,kind:'pair',map,algorithm:'astar',reference:'bfs'},m=>pair.push(m));
  for(const item of pair.filter(m=>m.kind==='measurement')){assert.equal(item.summary.sampleCount,5);assert.equal(item.summary.warmupCount,1);assert.equal(item.summary.timingKind,'median');assert.equal(item.summary.includesDetails,false);}
});
for(const kind of ['pair','compare'])test(`回归：${kind}搜索结果加载后直接同步播放，无需再次点击播放`,()=>{
  const map=generateMaze({rows:15,cols:25,version:12}),out=[];
  executeRequest({id:21,version:12,kind,map,algorithm:'astar',reference:'bfs'},m=>out.push(m));
  const left=out.find(m=>m.algorithm==='astar'&&m.result).result,right=out.find(m=>m.algorithm==='bfs'&&m.result).result;
  const p=new PairPlayback(map.walls.length,100);p.load(left,right);
  assert.equal(p.state,'playing');p.update(.1);assert.equal(p.index,10);assert.equal(p.left.index,10);assert.equal(p.right.index,10);
  assert.ok(p.left.mask.some(Boolean));assert.ok(p.right.mask.some(Boolean));
  p.toggle();p.update(10);assert.equal(p.index,10);p.step();assert.equal(p.index,11);assert.equal(p.state,'paused');
  p.rewind();assert.equal(p.index,0);assert.equal(p.state,'paused');p.rewind(true);p.finish();assert.equal(p.state,'completed');
  for(const id of left.path)assert.equal(p.left.pathMask[id],1);for(const id of right.path)assert.equal(p.right.pathMask[id],1);
});
test('显式暂停仍阻止自动推进，同起终点和不可达结果均能正确结束',()=>{
  for(const map of [new Maze(1,1,{walls:[0],start:[0,0],goal:[0,0]}),new Maze(3,3,{walls:[0,0,0,1,1,1,0,0,0],start:[0,0],goal:[2,2]})]){
    const a=searchMaze(map,'astar'),b=searchMaze(map,'bfs'),p=new PairPlayback(map.walls.length,100);
    p.load(a,b,false);assert.equal(p.state,'paused');p.update(10);assert.equal(p.index,0);p.step();assert.equal(p.index,1);
    p.finish();assert.equal(p.state,'completed');assert.equal(p.index,Math.max(a.visitedCount,b.visitedCount));
    assert.equal(p.left.pathMask.some(Boolean),a.found);assert.equal(p.right.pathMask.some(Boolean),b.found);
  }
});
