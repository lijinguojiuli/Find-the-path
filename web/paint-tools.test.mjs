import test from 'node:test';
import assert from 'node:assert/strict';
import {Grid,MODES,applyEdit,applyObstacleEdit} from './model.mjs';
import {PaintStroke} from './obstacle-stroke.mjs';
import {searchGrid} from './search.mjs';

function paint(stroke,cell){return stroke.visit(cell).map(p=>stroke.mode===MODES.obstacle?applyObstacleEdit(stroke.grid,p,stroke.blocked):applyEdit(stroke.grid,stroke.mode,p));}

test('回归：高成本画笔直接将障碍替换为成本5的通行格',()=>{
  const grid=new Grid(3,5,{obstacles:[[2,1]]});
  const result=applyEdit(grid,MODES.terrain,[2,1]);
  assert.equal(result.changed,true);assert.equal(grid.isBlocked([2,1]),false);assert.equal(grid.costAt([2,1]),5);
  assert.equal(grid.obstacleCount,0);assert.equal(grid.costs.size,1);
});
test('回归：普通地面画笔直接清除障碍和高成本',()=>{
  const grid=new Grid(3,5,{obstacles:[[1,1]],costs:[[2,1,5]]});
  for(const cell of [[1,1],[2,1]]){assert.equal(applyEdit(grid,MODES.plain,cell).changed,true);assert.equal(grid.isBlocked(cell),false);assert.equal(grid.costAt(cell),1);}
  assert.equal(grid.obstacleCount,0);assert.equal(grid.costs.size,0);
});
test('障碍画笔覆盖高成本，移除障碍后恢复普通成本',()=>{
  const grid=new Grid(3,5,{costs:[[2,1,5]]});
  assert.equal(applyEdit(grid,MODES.obstacle,[2,1]).action,'add');assert.equal(grid.costs.size,0);
  assert.equal(applyEdit(grid,MODES.obstacle,[2,1]).action,'remove');assert.equal(grid.costAt([2,1]),1);
});
test('高成本快速拖动跨过墙、空地和旧地形，整条变为成本5',()=>{
  const grid=new Grid(4,10,{obstacles:[[2,1],[5,1]],costs:[[4,1,5]]}),before=grid.snapshot(),s=new PaintStroke(grid,[1,1],MODES.terrain);
  paint(s,[1,1]);paint(s,[8,1]);assert.equal(grid.obstacleCount,0);assert.equal(grid.costs.size,8);
  for(let x=1;x<=8;x++){assert.equal(grid.isBlocked([x,1]),false);assert.equal(grid.costAt([x,1]),5);}
  assert.deepEqual(paint(s,[1,1]),[]);assert.deepEqual(new Grid(before.rows,before.cols,before).snapshot(),before);
});
test('从已有高成本上按下继续涂抹，固定画笔不会变成擦除',()=>{
  const grid=new Grid(3,8,{costs:[[1,1,5]]}),s=new PaintStroke(grid,[1,1],MODES.terrain);
  assert.equal(paint(s,[1,1])[0].changed,false);paint(s,[6,1]);assert.equal(grid.costs.size,6);
  for(let x=1;x<=6;x++)assert.equal(grid.costAt([x,1]),5);
});
test('普通地面拖动清除混合障碍和成本，回拖与结束均不产生新变化',()=>{
  const grid=new Grid(3,8,{obstacles:[[2,1],[4,1]],costs:[[3,1,5],[6,1,5]]}),s=new PaintStroke(grid,[1,1],MODES.plain);
  paint(s,[1,1]);paint(s,[6,1]);assert.equal(grid.obstacleCount,0);assert.equal(grid.costs.size,0);
  for(let x=1;x<=6;x++)assert.equal(grid.costAt([x,1]),1);
  assert.deepEqual(paint(s,[2,1]),[]);s.end();assert.deepEqual(paint(s,[7,1]),[]);
});
test('三种画笔交替覆盖，保存一笔前的状态可以完整恢复混合地图',()=>{
  const grid=new Grid(3,8,{obstacles:[[2,1]],costs:[[4,1,5]]}),original=grid.snapshot();
  for(const mode of [MODES.terrain,MODES.obstacle,MODES.terrain,MODES.plain]){
    const before=grid.snapshot(),s=new PaintStroke(grid,[1,1],mode);paint(s,[1,1]);paint(s,[6,1]);
    assert.deepEqual(new Grid(before.rows,before.cols,before).snapshot(),before);
    for(let x=1;x<=6;x++){
      assert.equal(grid.isBlocked([x,1]),mode===MODES.obstacle);
      if(mode!==MODES.obstacle)assert.equal(grid.costAt([x,1]),mode===MODES.terrain?5:1);
    }
    assert.equal(grid.costs.size,mode===MODES.terrain?6:0);
  }
  assert.deepEqual(new Grid(original.rows,original.cols,original).snapshot(),original);
});
test('地形画笔可设置端点成本，障碍画笔仍不能覆盖端点',()=>{
  const grid=new Grid(1,5,{start:[0,0],goal:[4,0]}),s=new PaintStroke(grid,[0,0],MODES.terrain);paint(s,[0,0]);paint(s,[4,0]);
  assert.equal(grid.costAt(grid.start),5);assert.equal(grid.costAt(grid.goal),5);
  for(const cell of [grid.start,grid.goal])assert.equal(applyEdit(grid,MODES.obstacle,cell).changed,false);
  assert.equal(grid.isBlocked(grid.start),false);assert.equal(grid.isBlocked(grid.goal),false);
});
test('非画笔模式不能开始拖动，非法位置保持地图不变',()=>{
  const grid=new Grid(3,5),before=grid.snapshot();
  for(const mode of [MODES.start,MODES.goal,'unknown'])assert.throws(()=>new PaintStroke(grid,[1,1],mode));
  assert.throws(()=>new PaintStroke(grid,[-1,1],MODES.terrain));
  for(const mode of [MODES.terrain,MODES.plain])for(const cell of [null,[-1,1],[5,1],[1,3],[1.5,1]])assert.equal(applyEdit(grid,mode,cell).changed,false);
  assert.deepEqual(grid.snapshot(),before);
});
test('底层Grid.setCost仍拒绝直接给墙设置成本，画笔负责显式替换',()=>{
  const grid=new Grid(3,5,{obstacles:[[2,1]]}),before=grid.snapshot();
  assert.throws(()=>grid.setCost([2,1],5),/障碍/);assert.deepEqual(grid.snapshot(),before);
});
test('连续改图后搜索读取新成本，A*与Dijkstra仍返回同一最低成本',()=>{
  const grid=new Grid(3,5,{start:[0,1],goal:[4,1],obstacles:[[2,1]]}),s=new PaintStroke(grid,[1,1],MODES.terrain);
  paint(s,[1,1]);paint(s,[3,1]);
  for(const algorithm of ['dijkstra','astar']){const r=searchGrid(grid,algorithm);assert.equal(r.totalCost,6);assert.equal(r.path.length-1,6);assert.ok(r.path.every(p=>!grid.isBlocked(p)));}
  const clear=new PaintStroke(grid,[1,1],MODES.plain);paint(clear,[1,1]);paint(clear,[3,1]);
  for(const algorithm of ['dijkstra','astar'])assert.equal(searchGrid(grid,algorithm).totalCost,4);
});
