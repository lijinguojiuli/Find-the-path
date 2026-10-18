import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from './model.mjs';
import { searchGrid } from './search.mjs';
import { Robot } from './robot.mjs';
import { DynamicPlanner, runReplan } from './replanning.mjs';

function setup(rows = 5) {
  const y = Math.floor(rows / 2), grid = new Grid(rows, 7, {start:[0,y],goal:[6,y]});
  const robot = new Robot(grid, searchGrid(grid).path, 2); robot.start(); robot.update(1);
  return {grid,robot,planner:new DynamicPlanner(robot)};
}
function valid(grid, path, origin) {
  assert.deepEqual(path[0], origin); assert.deepEqual(path.at(-1), grid.goal);
  path.forEach((cell,index) => {
    assert(grid.inBounds(cell) && !grid.isBlocked(cell));
    if(index) assert.equal(Math.abs(cell[0]-path[index-1][0])+Math.abs(cell[1]-path[index-1][1]),1);
  });
}
test('路径外障碍不打断移动，不重置半格时间', () => {
  const {robot,planner}=setup(); robot.update(.25);
  const path=robot.path;
  assert.equal(planner.addObstacle([0,0]),null);
  assert.equal(robot.state,'moving'); assert.equal(robot.path,path); assert.equal(planner.replanCount,0);
  robot.update(.25); assert.deepEqual(robot.position,[3,2]);
});
test('封堵剩余路径后立即丢弃旧路线，搜索期间不前进', () => {
  const {robot,planner}=setup(); const request=planner.changeObstacle([3,2]);
  assert.equal(robot.state,'replanning'); assert.deepEqual(robot.path,[[2,2]]);
  robot.start(); robot.update(100); assert.deepEqual(robot.position,[2,2]);
  assert.deepEqual(request.map.start,[2,2]);
});
test('A* 从当前位置绕行，地图起点不变，成功后继续移动', () => {
  const {grid,robot,planner}=setup(); const result=planner.addObstacle([3,2]);
  assert(result.found); valid(grid,result.path,[2,2]); assert.deepEqual(grid.start,[0,2]);
  assert.equal(robot.state,'moving'); assert.equal(robot.speed,2);
  robot.update(100); assert.equal(robot.state,'arrived'); assert.deepEqual(robot.position,grid.goal);
});
test('无可行路径安全停止，开始或重置不会复活旧路径', () => {
  const {robot,planner}=setup(1); const result=planner.addObstacle([3,0]);
  assert.equal(result.found,false); assert.deepEqual(result.path,[]);
  for(let i=0;i<3;i++){robot.start();robot.update(100);robot.reset();assert.equal(robot.state,'blocked');assert.deepEqual(robot.position,[2,0]);}
});
test('机器人当前格和地图端点拒绝障碍，地图与运动均不变', () => {
  const {grid,robot,planner}=setup(); const before=grid.snapshot();
  for(const cell of [robot.position,grid.start,grid.goal]) assert.throws(()=>planner.addObstacle(cell));
  assert.deepEqual(grid.snapshot(),before); assert.equal(robot.state,'moving'); assert.equal(planner.version,0);
});
test('已走过的路径不算剩余路径，重复障碍不产生新版本', () => {
  const {robot,planner}=setup(); planner.addObstacle([1,2]); const version=planner.version;
  assert.equal(robot.state,'moving'); assert.equal(planner.replanCount,0);
  planner.addObstacle([1,2]); assert.equal(planner.version,version);
  robot.update(100); assert.equal(robot.state,'arrived');
});
test('重规划保留暂停状态，也接受搜索期间的暂停操作', () => {
  for(const before of [true,false]) {
    const {robot,planner}=setup(); if(before)robot.pause();
    const request=planner.changeObstacle([3,2]); if(!before)planner.pause();
    assert(planner.finishReplan(request,runReplan(request))); assert.equal(robot.state,'paused');
    robot.update(100); assert.deepEqual(robot.position,[2,2]);
  }
});
test('连续改图丢弃过期结果，最后一次失败后旧成功也不能使机器人移动', () => {
  const {robot,planner}=setup(3);
  const first=planner.changeObstacle([3,1]), result=runReplan(first);
  planner.changeObstacle([3,0]); const last=planner.changeObstacle([3,2]);
  assert(!planner.finishReplan(first,result));
  assert(planner.finishReplan(last,runReplan(last))); assert.equal(robot.state,'blocked');
  assert(!planner.finishReplan(first,result)); robot.start(); robot.update(100); assert.deepEqual(robot.position,[2,1]);
});
test('搜索期间路径外改动也刷新快照', () => {
  const {robot,planner}=setup(); const first=planner.changeObstacle([3,2]);
  const latest=planner.changeObstacle([0,0]); assert(latest.token>first.token);
  assert(!planner.finishReplan(first,runReplan(first)));
  assert(planner.finishReplan(latest,runReplan(latest))); assert.equal(robot.state,'moving');
});
test('移除障碍后可在停止位置重新规划', () => {
  const {robot,planner}=setup(1); planner.addObstacle([3,0]); planner.changeObstacle([3,0],false);
  const request=planner.requestReplan(); assert.deepEqual(request.map.start,[2,0]);
  planner.finishReplan(request,runReplan(request)); assert.equal(robot.state,'ready');
  robot.start();robot.update(100);assert.equal(robot.state,'arrived');
});
test('地形成本继续参与重规划，起点成本不收费', () => {
  const {grid,planner}=setup(3); grid.setCost([2,1],9);
  for(let x=2;x<7;x++)grid.setCost([x,0],5);
  const result=planner.addObstacle([3,1]); assert.equal(result.totalCost,6); assert(result.path.some(cell=>String(cell)==='2,2'));
});
test('直接改图或非法搜索结果不能恢复旧路线', () => {
  const first=setup(), request=first.planner.changeObstacle([3,2]), result=runReplan(request);
  first.grid.addObstacle([2,1]); assert(!first.planner.finishReplan(request,result)); assert.equal(first.robot.state,'blocked');
  const second=setup(), next=second.planner.changeObstacle([3,2]);
  assert.throws(()=>second.planner.finishReplan(next,{found:true,path:[[0,2],[6,2]]}));
  assert.equal(second.robot.state,'blocked');
});
test('重置不能把机器人送回后来被封住的重规划起点', () => {
  const {grid,robot,planner}=setup(); planner.addObstacle([3,2]);
  const origin=robot.position; robot.update(.5); const current=robot.position;
  planner.addObstacle(origin); robot.reset();
  assert.deepEqual(robot.position,current); assert(!grid.isBlocked(robot.position)); assert.equal(robot.state,'blocked');
});
