import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSearchRequest } from './search-worker.mjs';
import { Grid } from './model.mjs';

test('重规划 Worker 始终使用 A*，回传请求身份且不改地图', () => {
  const map=new Grid(3,5,{start:[1,1],goal:[4,1],costs:[[2,1,5],[3,1,5]]}).snapshot();
  const before=structuredClone(map);
  const data=executeSearchRequest({id:17,version:4,kind:'replan',map,algorithm:'bfs',compare:true});
  assert.equal(data.id,17);assert.equal(data.version,4);assert.equal(data.kind,'replan');
  assert.deepEqual(data.measurements.map(item=>item.algorithm),['astar']);
  assert.deepEqual(data.result.path[0],[1,1]);assert.equal(data.result.totalCost,5);assert.deepEqual(map,before);
});
test('普通对比仍包含三个算法，重规划不可达安全返回空路径', () => {
  const map=new Grid(1,3,{start:[0,0],goal:[2,0],obstacles:[[1,0]]}).snapshot();
  const normal=executeSearchRequest({id:1,version:1,map,algorithm:'bfs',compare:true});
  assert.equal(normal.measurements.length,3);
  const replan=executeSearchRequest({id:2,version:2,kind:'replan',map});
  assert.equal(replan.result.found,false);assert.deepEqual(replan.result.path,[]);
});
test('Worker 错误仍带有原请求身份，不伪造搜索成功', () => {
  const data=executeSearchRequest({id:8,version:9,kind:'replan',map:new Grid(1,1).snapshot()});
  assert.equal(data.id,8);assert.equal(data.version,9);assert.equal(data.kind,'replan');
  assert.match(data.error,/起点/);assert.equal(data.result,undefined);
});
