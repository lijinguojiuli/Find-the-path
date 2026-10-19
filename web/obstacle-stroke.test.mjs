import test from 'node:test';
import assert from 'node:assert/strict';
import {Grid,applyObstacleEdit} from './model.mjs';
import {ObstacleStroke} from './obstacle-stroke.mjs';
import {Robot} from './robot.mjs';
import {DynamicPlanner,runReplan} from './replanning.mjs';
import {searchGrid} from './search.mjs';

function paint(stroke,cell){return stroke.visit(cell).map(p=>applyObstacleEdit(stroke.grid,p,stroke.blocked));}
test('按下空地连续布置，快速横拖不会漏格，回拖不翻转',()=>{
  const grid=new Grid(4,9),stroke=new ObstacleStroke(grid,[1,1]);
  paint(stroke,[1,1]);paint(stroke,[7,1]);const before=grid.snapshot();
  assert.equal(grid.obstacleCount,7);for(let x=1;x<=7;x++)assert.ok(grid.isBlocked([x,1]));
  assert.deepEqual(paint(stroke,[3,1]),[]);assert.deepEqual(grid.snapshot(),before);
});
test('纵向与斜向跳跃补齐为四邻接连续墙体',()=>{
  for(const [a,b]of [[[2,1],[2,8]],[[1,1],[8,6]],[[8,6],[1,1]],[[1,8],[7,1]]]){
    const grid=new Grid(10,10),s=new ObstacleStroke(grid,a),cells=[...s.visit(a),...s.visit(b)];
    assert.deepEqual(cells[0],a);assert.deepEqual(cells.at(-1),b);
    for(let i=1;i<cells.length;i++)assert.equal(Math.abs(cells[i][0]-cells[i-1][0])+Math.abs(cells[i][1]-cells[i-1][1]),1);
    for(const p of cells)applyObstacleEdit(grid,p,s.blocked);assert.equal(grid.obstacleCount,cells.length);
  }
});
test('同一笔添加经过已有障碍时保留障碍，不变成擦除',()=>{
  const grid=new Grid(3,7,{obstacles:[[3,1]]}),s=new ObstacleStroke(grid,[1,1]);paint(s,[1,1]);paint(s,[5,1]);
  assert.equal(grid.obstacleCount,5);assert.ok(grid.isBlocked([3,1]));
});
test('从障碍按下持续擦除，经过空地不会反向添加',()=>{
  const grid=new Grid(3,7,{obstacles:[[1,1],[3,1],[5,1]]}),s=new ObstacleStroke(grid,[1,1]);
  assert.equal(s.blocked,false);paint(s,[1,1]);paint(s,[5,1]);assert.equal(grid.obstacleCount,0);
  paint(s,[1,1]);assert.equal(grid.obstacleCount,0);
});
test('起终点受保护，拖动仍可继续处理两边的空地',()=>{
  const grid=new Grid(3,7,{start:[2,1],goal:[4,1]}),s=new ObstacleStroke(grid,[1,1]);paint(s,[1,1]);paint(s,[5,1]);
  assert.equal(grid.obstacleCount,3);assert.equal(grid.isBlocked(grid.start),false);assert.equal(grid.isBlocked(grid.goal),false);
});
test('地图外、非法坐标和离开后重新进入均不越界、不跨空白连线',()=>{
  const grid=new Grid(4,9),s=new ObstacleStroke(grid,[1,1]);paint(s,[1,1]);
  for(const cell of [null,[-1,1],[9,1],[1,4],[1.5,1]])assert.deepEqual(s.visit(cell),[]);
  assert.deepEqual(s.visit([7,1]),[[7,1]]);assert.equal(grid.obstacleCount,1);
});
test('结束或取消后移动不再绘制，新的一笔可选择相反操作',()=>{
  const grid=new Grid(3,7),s=new ObstacleStroke(grid,[1,1]);paint(s,[1,1]);s.end();
  assert.deepEqual(paint(s,[5,1]),[]);assert.equal(grid.obstacleCount,1);
  const next=new ObstacleStroke(grid,[1,1]);paint(next,[1,1]);assert.equal(grid.obstacleCount,0);
});
test('整笔前的单个快照可恢复墙体和被覆盖的地形成本',()=>{
  const grid=new Grid(4,9,{start:[0,0],goal:[8,3],costs:[[2,1,5]]}),before=grid.snapshot(),s=new ObstacleStroke(grid,[1,1]);
  paint(s,[1,1]);paint(s,[6,1]);assert.equal(grid.costs.size,0);
  const restored=new Grid(before.rows,before.cols,before);assert.deepEqual(restored.snapshot(),before);assert.equal(restored.costAt([2,1]),5);
});
test('显式添加与移除具有幂等性，非法参数不改图',()=>{
  const grid=new Grid(3,3);assert.equal(applyObstacleEdit(grid,[1,1],true).changed,true);
  assert.equal(applyObstacleEdit(grid,[1,1],true).changed,false);
  const before=grid.snapshot();for(const [p,b]of [[null,true],[[3,1],true],[[1,1],null]])assert.equal(applyObstacleEdit(grid,p,b).changed,false);
  assert.deepEqual(grid.snapshot(),before);assert.equal(applyObstacleEdit(grid,[1,1],false).changed,true);assert.equal(applyObstacleEdit(grid,[1,1],false).changed,false);
});
test('连续封堵时立即停止旧路线，只接受最后一次改图的重规划',()=>{
  const grid=new Grid(5,9,{start:[0,2],goal:[8,2]}),robot=new Robot(grid,searchGrid(grid).path,1);robot.start();robot.update(1);
  const planner=new DynamicPlanner(robot),s=new ObstacleStroke(grid,[4,2]);let first,last;
  for(const cell of [...s.visit([4,2]),...s.visit([4,3])]){last=planner.changeObstacle(cell,s.blocked);first??=last;}
  assert.equal(robot.state,'replanning');robot.update(100);assert.deepEqual(robot.position,[1,2]);
  assert.equal(planner.finishReplan(first,runReplan(first)),false);assert.ok(planner.finishReplan(last,runReplan(last)));assert.equal(robot.state,'moving');
  assert.ok(robot.path.every(p=>!grid.isBlocked(p)));assert.deepEqual(robot.path[0],[1,2]);
});
test('拖动经过机器人当前位置时拒绝该格，其他格仍可添加',()=>{
  const grid=new Grid(3,9,{start:[0,1],goal:[8,1]}),robot=new Robot(grid,searchGrid(grid).path,1);robot.start();robot.update(2);
  const planner=new DynamicPlanner(robot),s=new ObstacleStroke(grid,[1,1]);let rejected=0;
  for(const cell of [...s.visit([1,1]),...s.visit([4,1])]){try{planner.changeObstacle(cell,s.blocked);}catch{rejected++;}}
  assert.equal(rejected,1);assert.equal(grid.isBlocked([2,1]),false);assert.equal(grid.isBlocked([3,1]),true);assert.deepEqual(robot.position,[2,1]);
});
test('连续画墙封闭整张地图时停止，旧的成功结果不能恢复移动',()=>{
  const grid=new Grid(3,9,{start:[0,1],goal:[8,1]}),robot=new Robot(grid,searchGrid(grid).path,1);robot.start();robot.update(1);
  const planner=new DynamicPlanner(robot),s=new ObstacleStroke(grid,[4,0]);let first,last,oldResult;
  for(const cell of [...s.visit([4,0]),...s.visit([4,2])]){
    const request=planner.changeObstacle(cell,s.blocked);
    if(request&&!first){first=request;oldResult=runReplan(first);}
    if(request)last=request;
  }
  assert.equal(oldResult.found,true);const result=runReplan(last);assert.equal(result.found,false);
  assert.equal(planner.finishReplan(last,result),true);assert.equal(robot.state,'blocked');
  assert.equal(planner.finishReplan(first,oldResult),false);robot.start();robot.update(100);assert.deepEqual(robot.position,[1,1]);
});
